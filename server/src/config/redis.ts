import { createClient } from "redis";
import { config } from "./env";
import { logger } from "../utils/logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/** Caps one connection attempt, so a black-holed socket cannot stall forever. */
const SOCKET_CONNECT_TIMEOUT_MS = 5_000;
/** Ceiling on reconnect backoff. Retries continue past this, just no slower. */
const MAX_RECONNECT_DELAY_MS = 2_000;
/**
 * How long boot waits for Redis before giving up and letting the server listen.
 *
 * Exported so the test can bound itself against this rather than hardcoding a
 * duration that silently decouples the moment someone tunes it. Short is safe:
 * the socket keeps retrying in the background either way, so a slow Redis is
 * picked up shortly after boot instead of holding the port closed.
 */
export const BOOT_CONNECT_TIMEOUT_MS = 5_000;

export const redisClient = createClient({
    url: REDIS_URL,
    socket: {
        connectTimeout: SOCKET_CONNECT_TIMEOUT_MS,
        // Explicit rather than defaulted, because the default is the thing that
        // has to keep being true: retry FOREVER with capped backoff. Returning
        // an Error here would make a transient outage permanent until a restart.
        // Boot is bounded by a timeout in connectRedis() instead -- see below.
        reconnectStrategy: (retries) =>
            Math.min((retries + 1) * 200, MAX_RECONNECT_DELAY_MS)
    },
    // Commands must REJECT while the socket is down, not queue.
    //
    // node-redis queues offline commands by default, so sendCommand stayed
    // PENDING during an outage rather than rejecting. express-rate-limit's
    // passOnStoreError only handles a rejection, so every /api/* request stalled
    // with no response and no timeout -- the limiter's "fail open" was really
    // "hang". The same reached the socket handshake limiter and the filter quota.
    disableOfflineQueue: true
});

redisClient.on("error", (err) => logger.error(`Redis Client Error: ${err}`));
redisClient.on("connect", () => logger.info("Redis Connected"));

// Settles once the boot connect attempt has FINISHED -- succeeded or not. The
// rate limiter's Redis store is constructed at import time, before start()
// connects, so it needs something to await rather than failing with
// ClientClosedError. It resolves either way on purpose: rejecting would strand
// every caller that awaits it, which is the same bug one layer down.
let resolveReady: () => void;
export const redisReady = new Promise<void>((resolve) => {
    resolveReady = resolve;
});

/**
 * Rejects if Redis is not reachable within BOOT_CONNECT_TIMEOUT_MS.
 *
 * This used to `await redisClient.connect()` bare. With an unbounded reconnect
 * strategy that promise neither resolves nor rejects while Redis is down, so
 * the try/catch in server.ts was unreachable: connectDB() was never called,
 * server.listen() never ran, and no port ever opened. On Render the health
 * check then got connection-refused and the deploy restart-looped forever.
 *
 * The attempt is deliberately NOT cancelled on timeout -- it keeps retrying in
 * the background, so a Redis that comes back late is picked up without needing
 * a restart. We simply stop waiting on it.
 */
export const connectRedis = async () => {
    const attempt = redisClient.connect();
    // The socket keeps retrying after we stop awaiting, and a late failure would
    // otherwise surface as an unhandled rejection. Errors still reach the
    // "error" handler above.
    attempt.catch(() => {});

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            attempt,
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () =>
                        reject(
                            new Error(
                                `Redis did not connect within ${BOOT_CONNECT_TIMEOUT_MS}ms`
                            )
                        ),
                    BOOT_CONNECT_TIMEOUT_MS
                );
            })
        ]);
    } finally {
        if (timer) clearTimeout(timer);
        // Always, on both paths: anything awaiting redisReady must be released
        // even when Redis never arrived.
        resolveReady();
    }
};
