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

interface SocketData {
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

async function rateLimitMiddleware(socket: Socket, next: (err?: Error) => void) {
    const ip = socket.handshake.address || "unknown";
    const LIMIT = 20; 
    const WINDOW_MS = 60000;
    
    const key = `rate_limit:${ip}`;
    
    try {
        const count = await redisClient.incr(key);
        if (count === 1) {
            await redisClient.expire(key, Math.floor(WINDOW_MS / 1000));
        }
        
        if (count > LIMIT) {
            logger.warn(`Rate limit blocked IP: ${ip}`);
            return next(new Error("Too many connection attempts."));
        }
        
        next();
    } catch (error) {
        logger.error(`Redis rate limit error: ${error}`);
        next(); // allow connection on redis failure
    }
}
