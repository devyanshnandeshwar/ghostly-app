import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redisClient, redisReady } from "../config/redis";
import { parseBearer, verifySessionToken } from "../utils/token";

// Key on the session we actually verified, so the limit can't be reset by
// inventing a new identifier. Unauthenticated requests fall back to IP.
//
// ipKeyGenerator normalises IPv6: without it every request from a /64 gets its
// own bucket, so a single client with an IPv6 prefix can sidestep the limit.
const keyGenerator = (req: any) => {
    const token = parseBearer(req.get?.("authorization"));

    if (token) {
        const payload = verifySessionToken(token);
        if (payload) return `session:${payload.deviceId}`;
    }

    return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
};

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
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 requests per minute
    keyGenerator,
    store: store("verify"),
    message: { error: "Too many verification attempts. Please wait." }
});

export const sessionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // 100 requests per hour
    keyGenerator,
    store: store("session"),
    message: { error: "Too many session init attempts. Please wait." }
});

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    keyGenerator,
    store: store("global"),
    message: { error: "Too many requests. Please wait." }
});
