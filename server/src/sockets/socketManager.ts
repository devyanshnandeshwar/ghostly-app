import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { createAdapter } from "@socket.io/redis-adapter";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { socketAuth } from "./auth.socket";
import { matchSocketHandler } from "./match.socket";
import { chatSocketHandler } from "./chat.socket";
import { reportSocketHandler } from "./report.socket";
import { ClientToServerEvents, ServerToClientEvents } from "@shared/types/SocketEvents";
import { IUserSession } from "@shared/types/User";

export interface SocketData {
    session: IUserSession;
    // activeMatch is deliberately absent: it lives in Redis via
    // presence.service so every instance can see it. publicKey stays here
    // because fetchSockets() serializes socket.data across instances.
    publicKey?: JsonWebKey;
}

/**
 * Wires Socket.IO through Redis so rooms and emits cross instance boundaries.
 * Must run after connectRedis(); without it the server is single-instance only.
 */
export async function attachRedisAdapter(io: Server) {
    const subClient = redisClient.duplicate();
    subClient.on("error", (err) => logger.error(`Redis adapter sub error: ${err}`));

    await subClient.connect();
    io.adapter(createAdapter(redisClient as any, subClient as any));

    logger.info("Socket.IO Redis adapter attached");
}

/**
 * A connected socket with its authenticated session attached.
 *
 * Handlers must use this rather than a bare Socket: with `Socket`, socket.data
 * is `any`, which is how `session.sessionId` -- a field that exists on
 * QueueUser but not on IUserSession -- silently compiled and disabled the skip
 * cooldown entirely.
 */
export type SessionSocket = Socket<any, any, any, SocketData>;

export function initializeSocketIO(httpServer: HttpServer) {
    const io = new Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>(httpServer, {
        cors: {
            origin: config.CORS_ORIGINS,
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    // Middlewares
    io.use(rateLimitMiddleware);
    io.use(socketAuth);

    io.on("connection", (socket) => {
        // debug, not info: this fires on every connection and the VM has
        // limited IOPS to spend on log writes.
        logger.debug(`Socket connected: ${socket.id}`);

        // Register Handlers
        matchSocketHandler(io, socket);
        chatSocketHandler(io, socket);
        reportSocketHandler(io, socket);

        socket.on("disconnect", () => {
            logger.debug(`Socket disconnected: ${socket.id}`);
        });
    });

    return io;
}

import { redisClient } from "../config/redis";
import { resolveClientKey } from "./clientKey";

// Per identity, not per proxy. resolveClientKey prefers the verified session and
// falls back to the real client IP taken from X-Forwarded-For at the same hop
// depth Express trusts -- see clientKey.ts for why the old key was global.
const CONNECT_LIMIT = 60;
const CONNECT_WINDOW_SECONDS = 60;

async function rateLimitMiddleware(socket: Socket, next: (err?: Error) => void) {
    const clientKey = resolveClientKey(socket.handshake);
    const key = `rate_limit:${clientKey}`;

    try {
        const count = await redisClient.incr(key);

        // Set the TTL on every increment rather than only the first. A dropped
        // EXPIRE used to strand the counter with no expiry at all, locking that
        // key out permanently.
        await redisClient.expire(key, CONNECT_WINDOW_SECONDS);

        if (count > CONNECT_LIMIT) {
            logger.warn(`Rate limit blocked ${clientKey}`);
            return next(new Error("Too many connection attempts."));
        }

        next();
    } catch (error) {
        logger.error(`Redis rate limit error: ${error}`);
        next(); // allow connection on redis failure
    }
}
