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
    // Redis is not allowed to prevent a boot.
    //
    // It holds the filter quota and the rate-limit counters -- abuse controls,
    // not the product. The limiters already fail open at request time (see
    // FAIL_OPEN in rateLimit.middleware), so refusing to start when Redis is
    // briefly unreachable was strictly harsher than the hot path it protects,
    // and on a managed Redis a boot-time blip is an ordinary event.
    //
    // Mongo is different and stays fatal: without it there are no sessions, and
    // every request would fail anyway.
    try {
        await connectRedis();
    } catch (error: any) {
        logger.error(
            `[Server] Redis unavailable at boot, continuing without it: ${error?.message ?? error}`
        );
    }

    await connectDB();

    server.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
    });
}

/** Bounds the drain, so a stuck connection cannot hold the process open. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

const closeQuietly = (label: string, close: (cb: () => void) => void) =>
    new Promise<void>((resolve) => {
        close(() => {
            logger.info(`[Server] ${label} closed`);
            resolve();
        });
    });

let shuttingDown = false;

const shutdown = async () => {
    // SIGTERM can arrive more than once, and Render sends it on every deploy
    // and every spin-down. Re-entering would close things twice.
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info("[Server] Gracefully shutting down...");

    // Previously process.exit(0) ran while these were still closing, so
    // in-flight requests and every open conversation were severed rather than
    // drained -- on a free tier that idles out, that is every deploy and every
    // nap.
    const drain = Promise.all([
        closeQuietly("HTTP server", (cb) => server.close(cb)),
        closeQuietly("Socket.IO", (cb) => io.close(cb))
    ]);

    const timedOut = Symbol("timeout");
    const result = await Promise.race([
        drain,
        new Promise((resolve) => setTimeout(() => resolve(timedOut), SHUTDOWN_TIMEOUT_MS))
    ]);

    if (result === timedOut) {
        logger.warn(`[Server] Drain exceeded ${SHUTDOWN_TIMEOUT_MS}ms, exiting anyway`);
    }

    try {
        await import("mongoose").then((m) => m.disconnect());
        logger.info("[Server] MongoDB disconnected");
    } catch (err) {
        logger.error("[Server] Error disconnecting MongoDB", err);
    }

    if (redisClient.isOpen) {
        try {
            await redisClient.disconnect();
            logger.info("[Server] Redis disconnected");
        } catch (err) {
            logger.error("[Server] Error disconnecting Redis", err);
        }
    }

    process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Without these the process dies on an unhandled rejection with whatever the
// runtime prints, mid-request, leaving open sockets severed and no line in the
// log saying it was us. safeHandler covers socket listeners only; anything
// outside a socket handler -- a controller, a service, a stray timer -- had
// nothing. Drain first so in-flight chats close cleanly, then exit non-zero so
// the platform restarts rather than leaving a half-dead process serving.
const fatal = (label: string) => (error: unknown) => {
    logger.error(
        `[Server] ${label}: ${
            error instanceof Error ? (error.stack ?? error.message) : String(error)
        }`
    );
    // shutdown() ends in process.exit(0), which would report success for a
    // crash, so bound the drain here and exit 1 regardless of which wins.
    const drained = shutdown().catch(() => {});
    Promise.race([
        drained,
        new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS))
    ]).finally(() => process.exit(1));
};

process.on("uncaughtException", fatal("Uncaught exception"));
process.on("unhandledRejection", fatal("Unhandled rejection"));

// connectRedis is bounded by its own timeout now and start() tolerates it
// failing, so reaching here means something else: Mongo, or a config assertion
// that threw at import time. Either way no port ever opened, so say why rather
// than dying silently.
start().catch((error: any) => {
    logger.error(`[Server] Failed to start: ${error?.message ?? error}`);
    process.exit(1);
});
