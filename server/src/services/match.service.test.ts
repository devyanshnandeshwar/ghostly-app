import { describe, expect, test, spyOn, afterEach } from "bun:test";
import { redisClient } from "../config/redis";
import { SKIP_COOLDOWN_SECONDS, setCooldown } from "./match.service";

// The regression this guards: the handler told the client to wait 5 seconds
// while setCooldown wrote a 30-second key, so every skip produced a blocking
// alert and then refused the next search for another 25 seconds.

describe("setCooldown", () => {
    let setEx: ReturnType<typeof spyOn> | undefined;

    afterEach(() => {
        setEx?.mockRestore();
        setEx = undefined;
    });

    test("enforces exactly the cooldown the client is told to wait", async () => {
        setEx = spyOn(redisClient, "setEx").mockResolvedValue("OK" as any);

        await setCooldown("session-1");

        expect(setEx).toHaveBeenCalledWith(
            "ghosty:cooldown:session-1",
            SKIP_COOLDOWN_SECONDS,
            "1"
        );
    });

    test("publishes a cooldown short enough to be worth showing a countdown for", () => {
        // A skip cooldown is friction against spamming Next, not a penalty box.
        expect(SKIP_COOLDOWN_SECONDS).toBeGreaterThan(0);
        expect(SKIP_COOLDOWN_SECONDS).toBeLessThanOrEqual(10);
    });
});
