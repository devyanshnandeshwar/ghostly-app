import Redis from "ioredis";
import { config } from "./env";
import { logger } from "../utils/logger";

// Create Redis Client (for general data & publishing)
export const redisClient = new Redis(config.REDIS_URI || "redis://localhost:6379");

// Create Sub Client (specifically for Socket.IO Adapter)
export const subClient = redisClient.duplicate();

redisClient.on("connect", () => {
    logger.info("[Redis] Connected to Redis");
});

redisClient.on("error", (err) => {
    logger.error("[Redis] Connection Error:", err);
});

subClient.on("error", (err) => {
    logger.error("[Redis] Subscriber Connection Error:", err);
});
