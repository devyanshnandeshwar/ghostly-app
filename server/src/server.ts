import "module-alias/register";
import http from "http";
import dotenv from "dotenv";
import app from "./app";
import { connectDB } from "./config/db";
import { initializeSocketIO } from "./sockets/socketManager";
import { logger } from "./utils/logger";
import { config } from "./config/env";
import { connectRedis, redisClient } from "./config/redis";

const PORT = config.PORT;

const server = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocketIO(server);

async function start() {
    await connectRedis();
    await connectDB();

    server.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
    });
}

const shutdown = async () => {
    logger.info("\n[Server] Gracefully shutting down...");
    
    server.close(() => {
        logger.info("[Server] HTTP server closed");
    });

    io.close(() => {
         logger.info("[Server] Socket.IO closed");
    });
    
    try {
        await import("mongoose").then(m => m.disconnect());
        logger.info("[Server] MongoDB disconnected");
    } catch (err) {
        logger.error("[Server] Error disconnecting MongoDB", err);
    }
    
    if (redisClient.isOpen) {
        await redisClient.disconnect();
        logger.info("[Server] Redis disconnected");
    }
    
    process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();
