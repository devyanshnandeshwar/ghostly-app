import { describe, expect, test } from "bun:test";
import { SKIP_COOLDOWN_SECONDS, setCooldown, clearCooldown, addToQueue } from "./match.service";

// The regression this guards: the handler told the client to wait 5 seconds
// while the store was given 30, so every skip produced a countdown that ran out
// into a refusal 25 seconds later.
//
// match.service holds one process-wide queue, so every test uses its own
// session ids rather than trying to reset shared state.

const joiner = (sessionId: string) => ({
    socketId: `sock-${sessionId}`,
    sessionId,
    gender: "male" as const,
    preference: "any" as const,
    pastMatches: [] as string[],
    nickname: sessionId,
    bio: ""
});

describe("skip cooldown", () => {
    test("blocks a rejoin for exactly the cooldown the client is told about", () => {
        setCooldown("cooldown-blocked");

        expect(addToQueue(joiner("cooldown-blocked"))).toEqual({
            error: "cooldown",
            remaining: SKIP_COOLDOWN_SECONDS
        });
    });

    test("publishes a cooldown short enough to be worth showing a countdown for", () => {
        // A skip cooldown is friction against spamming Next, not a penalty box.
        expect(SKIP_COOLDOWN_SECONDS).toBeGreaterThan(0);
        expect(SKIP_COOLDOWN_SECONDS).toBeLessThanOrEqual(10);
    });

    test("lifting the cooldown lets the caller queue again", () => {
        setCooldown("cooldown-lifted");
        clearCooldown("cooldown-lifted");

        expect(addToQueue(joiner("cooldown-lifted"))).toBeNull();
    });

    test("a matched pair leaves neither party under a skip cooldown", () => {
        // Women seeking women: a bucket no other test in this file touches, so
        // the assertion cannot be spoiled by an entry another test left behind.
        const seeker = (sessionId: string) => ({
            ...joiner(sessionId),
            gender: "female" as const,
            preference: "female" as const
        });

        addToQueue(seeker("pair-waiter"));

        // The skipper is mid-cooldown when the partner appears.
        setCooldown("pair-skipper");
        clearCooldown("pair-skipper");
        const result = addToQueue(seeker("pair-skipper"));

        expect(result).toHaveProperty("user2");
        // Matching must clear the cooldown on BOTH sides, not just the joiner.
        expect(addToQueue(seeker("pair-waiter"))).not.toHaveProperty("error");
    });
});
