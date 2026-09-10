import { describe, expect, test, afterAll } from "bun:test";
import {
    connectRedis,
    redisReady,
    redisClient,
    BOOT_CONNECT_TIMEOUT_MS
} from "./redis";

// The regression this guards.
//
// redisClient was created with no reconnectStrategy and no connectTimeout, so
// node-redis used its default strategy -- which never gives up. connect() then
// neither resolved nor rejected while Redis was unreachable: it just retried,
// forever, behind a promise nobody could observe.
//
// server.ts wraps connectRedis() in a try/catch precisely so Redis is non-fatal
// at boot. That catch was unreachable. connectDB() was never called,
// server.listen() never ran, and NO PORT EVER OPENED -- the process sat there
// logging connection errors until something killed it.
//
// On Render that is worse than a crash: healthCheckPath gets connection-refused,
// the deploy is marked unhealthy, and it restart-loops indefinitely. Any Upstash
// blip at boot, or one wrong REDIS_URL, triggers it. It was reproduced twice by
// hand before this test existed, both times mistaken for noisy logging.
//
// The other two tests here cover the quieter half of the same root cause: a
// promise that never settles stalls a caller just as effectively as one that
// hangs at boot.
//
// REDIS_URL is a dead port in testing/setup.ts, so importing this module already
// points at something that cannot answer. This file deliberately does NOT mock
// config/redis -- unlike app.resilience.test.ts and quota.service.test.ts, which
// replace it wholesale and so can never catch this.

// Derived from the implementation's own budget rather than hardcoded, so tuning
// BOOT_CONNECT_TIMEOUT_MS cannot silently turn "hung" into a false pass (or a
// false failure -- an earlier draft of this file hardcoded 5s against a 10s
// boot timeout and reported the working fix as broken). The margin covers the
// socket teardown after the race resolves.
const SETTLE_BUDGET_MS = BOOT_CONNECT_TIMEOUT_MS + 4_000;

/** Resolves to what actually happened, so a hang is an assertable value. */
const raceToSettle = (work: Promise<unknown>) =>
    Promise.race([
        work.then(() => "settled" as const).catch(() => "settled" as const),
        new Promise<"hung">((resolve) =>
            setTimeout(() => resolve("hung"), SETTLE_BUDGET_MS)
        )
    ]);

afterAll(() => {
    // The client retries in the background; without this the test process is
    // held open by a socket that will never connect.
    redisClient.destroy();
});

describe("connectRedis with Redis unreachable", () => {
    test(
        "rejects rather than hanging, so server.ts can boot without Redis",
        async () => {
            const outcome = await raceToSettle(
                // Rejecting is the point; the reason is not under test.
                connectRedis().catch(() => undefined)
            );

            expect(outcome).toBe("settled");
        },
        20_000
    );

    test(
        "redisReady settles too, so awaiting it cannot strand a request",
        async () => {
            // rateLimit.middleware.ts does `if (!redisClient.isOpen) await
            // redisReady`. If that promise never settles when the boot connect
            // failed, every rate-limited request hangs with no response and no
            // timeout -- a second, quieter version of the same bug.
            const outcome = await raceToSettle(redisReady);

            expect(outcome).toBe("settled");
        },
        20_000
    );

    test(
        "a command rejects rather than queueing while disconnected",
        async () => {
            // node-redis queues commands offline by default, so sendCommand
            // stays PENDING rather than rejecting during an outage.
            // express-rate-limit's passOnStoreError only handles a rejection,
            // so a pending promise stalls the request instead of failing open.
            const outcome = await raceToSettle(
                redisClient.get("boot-probe").catch(() => undefined)
            );

            expect(outcome).toBe("settled");
        },
        20_000
    );
});
