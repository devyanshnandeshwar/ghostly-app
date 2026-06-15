import { createClient } from "redis";
import { config } from "./env";
import { logger } from "../utils/logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redisClient = createClient({
    url: REDIS_URL
});

redisClient.on("error", (err) => logger.error(`Redis Client Error: ${err}`));
redisClient.on("connect", () => logger.info("Redis Connected"));

export const connectRedis = async () => {
    await redisClient.connect();
};
