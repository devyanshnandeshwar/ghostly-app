import { describe, expect, test } from "bun:test";
import { TtlCache } from "./ttlCache";

// TtlCache had no tests at all, despite backing both caches in session.service:
// authViews, whose TTL bounds how long a revoked token keeps working, and
// sessionViews, whose TTL bounds how long a ban or a fresh pastMatches entry
// takes to bite. Every revocation and every moderation action in the product
// depends on the expiry boundary below being right.

/** A clock the test drives by hand, so expiry is tested without sleeping. */
function fakeClock(start = 1_000_000) {
    let now = start;
    return {
        now: () => now,
        advance: (ms: number) => {
            now += ms;
        }
    };
}

describe("TtlCache reads", () => {
    test("returns null for a key that was never written", () => {
        const cache = new TtlCache<string>(1000);

        expect(cache.get("absent")).toBeNull();
    });

    test("returns the stored value inside the window", () => {
        const clock = fakeClock();
        const cache = new TtlCache<string>(1000, clock.now);

        cache.set("k", "v");
        clock.advance(999);

        expect(cache.get("k")).toBe("v");
    });

    // The boundary is `expiresAt <= now`, so an entry is already gone at exactly
    // ttlMs rather than one tick later. Pinned because AUTH_CACHE_TTL_MS is
    // described as the bound on how long a revoked token survives -- an
    // off-by-one here makes that bound a lie.
    test("treats an entry as expired at exactly the TTL, not a tick later", () => {
        const clock = fakeClock();
        const cache = new TtlCache<string>(1000, clock.now);

        cache.set("k", "v");
        clock.advance(1000);

        expect(cache.get("k")).toBeNull();
    });

    test("distinguishes a stored null-ish value from a miss", () => {
        const cache = new TtlCache<number>(1000);

        cache.set("zero", 0);

        expect(cache.get("zero")).toBe(0);
    });
});

describe("TtlCache reclamation", () => {
    test("a read of an expired entry drops it rather than leaving it to rot", () => {
        const clock = fakeClock();
        const cache = new TtlCache<string>(1000, clock.now);

        cache.set("k", "v");
        clock.advance(1000);
        cache.get("k");

        expect(cache.size).toBe(0);
    });

    // Sweep-on-write is the only reclamation this cache has: there is no timer.
    // Without it an entry nobody ever reads again is held for the life of the
    // process, which is the leak the in-process rewrite had to avoid.
    test("a write sweeps entries nobody has read since they expired", () => {
        const clock = fakeClock();
        const cache = new TtlCache<string>(1000, clock.now);

        cache.set("a", "1");
        cache.set("b", "2");
        expect(cache.size).toBe(2);

        clock.advance(1000);
        cache.set("c", "3");

        expect(cache.size).toBe(1);
        expect(cache.get("c")).toBe("3");
    });

    test("a sweep leaves entries that are still inside their window", () => {
        const clock = fakeClock();
        const cache = new TtlCache<string>(1000, clock.now);

        cache.set("old", "1");
        clock.advance(600);
        cache.set("new", "2");

        clock.advance(399); // old is at 999, still live
        cache.set("third", "3");

        expect(cache.get("old")).toBe("1");
        expect(cache.size).toBe(3);
    });
});

describe("TtlCache writes", () => {
    test("overwriting a key replaces the value", () => {
        const cache = new TtlCache<string>(1000);

        cache.set("k", "first");
        cache.set("k", "second");

        expect(cache.get("k")).toBe("second");
    });

    // invalidateAuthCache and invalidateSessionCache are the levers revocation
    // and moderation pull; if delete did not take effect immediately, a bumped
    // tokenVersion would still be invisible for a full TTL.
    test("delete takes effect at once, not at the end of the window", () => {
        const cache = new TtlCache<string>(60_000);

        cache.set("k", "v");
        cache.delete("k");

        expect(cache.get("k")).toBeNull();
        expect(cache.size).toBe(0);
    });

    test("deleting a key that is not there is a no-op", () => {
        const cache = new TtlCache<string>(1000);

        expect(() => cache.delete("absent")).not.toThrow();
        expect(cache.size).toBe(0);
    });

    test("re-writing a key restarts its window rather than inheriting the old one", () => {
        const clock = fakeClock();
        const cache = new TtlCache<string>(1000, clock.now);

        cache.set("k", "v");
        clock.advance(900);
        cache.set("k", "v2");
        clock.advance(900); // 1800ms since the first write, 900 since the second

        expect(cache.get("k")).toBe("v2");
    });
});
