import { createClient } from "redis";
import { config } from "./env";
import { logger } from "../utils/logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redisClient = createClient({
    url: REDIS_URL
});

redisClient.on("error", (err) => logger.error(`Redis Client Error: ${err}`));
redisClient.on("connect", () => logger.info("Redis Connected"));

// Resolves once connect() has been called and completed. The rate limiter's
// Redis store is constructed at import time -- before start() connects -- so
// it needs something to await rather than failing with ClientClosedError.
let resolveReady: () => void;
export const redisReady = new Promise<void>((resolve) => {
    resolveReady = resolve;
});

export const connectRedis = async () => {
    await redisClient.connect();
    resolveReady();
};
