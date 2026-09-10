import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { resolveClientIp } from "../config/clientIp";
import RedisStore from "rate-limit-redis";
import { redisClient, redisReady } from "../config/redis";
import { parseBearer, verifySessionToken } from "../utils/token";

// Key on the session we actually verified, so the limit can't be reset by
// inventing a new identifier. Unauthenticated requests fall back to IP.
//
// NOT req.ip. Express derives that from `trust proxy`, a hop count, and on
// Render the chain is `client, cloudflare-edge, 10.x-render-lb` -- one hop in
// from the right is the internal balancer, the same value for every visitor.
// That put every unauthenticated caller, including everyone hitting session
// init on their first page load, into a single shared bucket. resolveClientIp
// prefers CF-Connecting-IP, which cannot be forged, and is the same resolution
// the socket handshake uses.
//
// ipKeyGenerator normalises IPv6: without it every request from a /64 gets its
// own bucket, so a single client with an IPv6 prefix can sidestep the limit.
const keyGenerator = (req: any) => {
    const token = parseBearer(req.get?.("authorization"));

    if (token) {
        const payload = verifySessionToken(token);
        if (payload) return `session:${payload.deviceId}`;
    }

    const address = resolveClientIp({
        headers: req.headers,
        socketAddress: req.socket?.remoteAddress
    });

    return `ip:${ipKeyGenerator(address)}`;
};

/**
 * Rate limiting is a defence against abuse, not a dependency of the product.
 *
 * express-rate-limit defaults passOnStoreError to false and RETHROWS a store
 * error, which Express 5 turns into next(err) and the error handler answers
 * with a 500. Because globalLimiter is mounted app-wide, one transient Redis
 * failure meant every route returned 500 -- auth, session init and /health
 * alike. The platform health check then failed and cycled the container, which
 * does nothing to fix a Redis outage and turns a blip into a restart loop.
 *
 * Failing open costs an unmetered window while Redis is down. Failing closed
 * costs the entire product. Every limiter below opts into the former.
 */
const FAIL_OPEN = { passOnStoreError: true } as const;

// Shared across instances. The default store is in-process, so with more than
// one replica -- which the Socket.IO Redis adapter exists to allow -- the real
// limit became N x max, and any restart wiped it.
//
// Each limiter needs its own prefix or they would share one counter.
const store = (prefix: string) =>
    new RedisStore({
        prefix: `ghosty:rl:${prefix}:`,
        // Await connection first: these stores are built at import time, which
        // is before start() calls connectRedis, so an eager command would
        // reject with ClientClosedError and leave the limiter uninitialised.
        sendCommand: async (...args: string[]) => {
            if (!redisClient.isOpen) await redisReady;
            return (redisClient as any).sendCommand(args);
        }
    });

export const verifyLimiter = rateLimit({
    ...FAIL_OPEN,
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 requests per minute
    keyGenerator,
    store: store("verify"),
    message: { error: "Too many verification attempts. Please wait." }
});

export const sessionLimiter = rateLimit({
    ...FAIL_OPEN,
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // 100 requests per hour
    keyGenerator,
    store: store("session"),
    message: { error: "Too many session init attempts. Please wait." }
});

export const globalLimiter = rateLimit({
    ...FAIL_OPEN,
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    keyGenerator,
    store: store("global"),
    message: { error: "Too many requests. Please wait." }
});
