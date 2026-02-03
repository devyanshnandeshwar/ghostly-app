import "module-alias/register";
import http from "http";
import dotenv from "dotenv";
import app from "./app";
import { connectDB } from "./config/db";
import { initializeSocketIO } from "./sockets/socketManager";
import { logger } from "./utils/logger";
import { config } from "./config/env";

const PORT = config.PORT;

const server = http.createServer(app);

// Initialize Socket.IO
// Initialize Socket.IO
const io = initializeSocketIO(server);

// Start Server
async function start() {
    await connectDB();

    server.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
    });
}

const shutdown = async () => {
    logger.info("\n[Server] Gracefully shutting down...");
    
    // 1. Stop accepting new connections
    server.close(() => {
        logger.info("[Server] HTTP server closed");
    });

    // 2. Close Socket.IO (disconnects all clients)
    io.close(() => {
         logger.info("[Server] Socket.IO closed");
    });
    
    // 3. Close Database
    try {
        await import("mongoose").then(m => m.disconnect());
        logger.info("[Server] MongoDB disconnected");
    } catch (err) {
        logger.error("[Server] Error disconnecting MongoDB", err);
    }
    
    process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();
