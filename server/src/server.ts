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

// The 60-second queue reconciler is gone. It existed to evict Redis entries
// whose socket died with a process that never ran its disconnect handlers; the
// queue now lives in that process, so entries cannot outlive it. Stale entries
// are dropped when they are looked at -- see queue.store.ts.

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

// connectRedis has no try/catch of its own, unlike connectDB which exits 1. An
// unreachable Redis at boot therefore rejected start(), server.listen was never
// reached, and the process died with no line saying why -- just a port that
// never opened.
start().catch((error: any) => {
    logger.error(`[Server] Failed to start: ${error?.message ?? error}`);
    process.exit(1);
});
