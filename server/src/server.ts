import http from "http";
import dotenv from "dotenv";
import app from "./app";
import { connectDB } from "./config/db";
import { initializeSocketIO, attachRedisAdapter } from "./sockets/socketManager";
import { logger } from "./utils/logger";
import { config } from "./config/env";
import { connectRedis, redisClient } from "./config/redis";
import { reconcileQueues } from "./services/match.service";

const PORT = config.PORT;

const server = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocketIO(server);

// Matchmaking queues live in Redis and outlive the process, so a crash or a
// deploy strands entries pointing at sockets that died with it. Sweep on a
// timer so the queue self-heals instead of needing a manual redis-cli purge.
const RECONCILE_INTERVAL_MS = 60_000;
const RECONCILE_STARTUP_DELAY_MS = 15_000;

let reconcileTimer: NodeJS.Timeout | undefined;
let reconcileStartupTimer: NodeJS.Timeout | undefined;

async function sweepQueues() {
    try {
        await reconcileQueues(io);
    } catch (error: any) {
        logger.error(`[Queue] Reconcile failed: ${error.message}`);
    }
}

async function start() {
    await connectRedis();
    await attachRedisAdapter(io);
    await connectDB();

    server.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
    });

    // Delayed so the adapter has time to discover peers; sweeping before that
    // could mistake another instance's sockets for dead ones.
    reconcileStartupTimer = setTimeout(sweepQueues, RECONCILE_STARTUP_DELAY_MS);
    reconcileTimer = setInterval(sweepQueues, RECONCILE_INTERVAL_MS);
}

const shutdown = async () => {
    logger.info("\n[Server] Gracefully shutting down...");

    if (reconcileStartupTimer) clearTimeout(reconcileStartupTimer);
    if (reconcileTimer) clearInterval(reconcileTimer);

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
