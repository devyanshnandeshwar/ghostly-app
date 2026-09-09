import { describe, expect, test, beforeEach, mock } from "bun:test";
import { FakeRedis } from "../testing/fakeRedis";
import { FREE_FILTERS_PER_DAY, FILTER_WINDOW_SECONDS } from "../config/limits";
import { filtersRemaining, getFilterUsage, hasFilterQuota, consumeFilter } from "./quota.service";

const redis = new FakeRedis();
mock.module("../config/redis", () => ({
    redisClient: redis,
    redisReady: Promise.resolve(),
    connectRedis: async () => {}
}));

// A static import is safe here: mock.module patches the live binding even for
// a module already resolved, so quota.service picks up the fake either way.

beforeEach(() => redis.reset());

describe("filtersRemaining", () => {
    test("counts down from the shared allowance", () => {
        expect(filtersRemaining(0)).toBe(FREE_FILTERS_PER_DAY);
        expect(filtersRemaining(2)).toBe(FREE_FILTERS_PER_DAY - 2);
    });

    test("clamps at zero rather than going negative", () => {
        expect(filtersRemaining(FREE_FILTERS_PER_DAY + 7)).toBe(0);
    });
});

describe("getFilterUsage", () => {
    test("reports nothing used and no pending reset for a fresh session", async () => {
        expect(await getFilterUsage("sess-new")).toEqual({
            used: 0,
            remaining: FREE_FILTERS_PER_DAY,
            total: FREE_FILTERS_PER_DAY,
            resetInSeconds: 0
        });
    });

    // The client must not need its own copy of the allowance: a second copy is
    // how the quota UI came to disagree with the server in the first place.
    // Shipping the total over the wire is what lets shared/ be deleted.
    test("carries the allowance itself, so the client needs no constant", async () => {
        await consumeFilter("sess-1");

        const usage = await getFilterUsage("sess-1");

        expect(usage.total).toBe(FREE_FILTERS_PER_DAY);
        expect(usage.remaining).toBe(FREE_FILTERS_PER_DAY - 1);
        expect(usage.used + usage.remaining).toBe(usage.total);
    });

    test("reports what has actually been consumed", async () => {
        await consumeFilter("sess-1");
        await consumeFilter("sess-1");

        const usage = await getFilterUsage("sess-1");

        expect(usage.used).toBe(2);
        expect(usage.remaining).toBe(FREE_FILTERS_PER_DAY - 2);
        expect(usage.resetInSeconds).toBe(FILTER_WINDOW_SECONDS);
    });
});

describe("consumeFilter", () => {
    test("starts a rolling window on first use", async () => {
        await consumeFilter("sess-1");

        expect((await getFilterUsage("sess-1")).resetInSeconds).toBe(FILTER_WINDOW_SECONDS);
    });

    test("does not extend the window on later uses", async () => {
        await consumeFilter("sess-1");
        redis.advance(60 * 60 * 1000); // an hour into the window
        await consumeFilter("sess-1");

        // The window runs from the FIRST use, so an hour has come off it.
        const usage = await getFilterUsage("sess-1");
        expect(usage.used).toBe(2);
        expect(usage.resetInSeconds).toBe(FILTER_WINDOW_SECONDS - 3600);
    });
});

describe("hasFilterQuota", () => {
    test("allows use below the allowance", async () => {
        await consumeFilter("sess-1");

        expect(await hasFilterQuota("sess-1")).toBe(true);
    });

    test("refuses once the allowance is spent", async () => {
        for (let i = 0; i < FREE_FILTERS_PER_DAY; i++) await consumeFilter("sess-1");

        expect(await hasFilterQuota("sess-1")).toBe(false);
    });

    // The bug this whole task exists for: the Mongo counter was never reset, so
    // a user who had ever spent five filters was locked out forever. Quota must
    // come back once the window passes.
    test("gives the allowance back after the window elapses", async () => {
        for (let i = 0; i < FREE_FILTERS_PER_DAY; i++) await consumeFilter("sess-1");
        expect(await hasFilterQuota("sess-1")).toBe(false);

        redis.advance(FILTER_WINDOW_SECONDS * 1000 + 1);

        expect(await hasFilterQuota("sess-1")).toBe(true);
        expect(await getFilterUsage("sess-1")).toEqual({
            used: 0,
            remaining: FREE_FILTERS_PER_DAY,
            total: FREE_FILTERS_PER_DAY,
            resetInSeconds: 0
        });
    });
});

// The regression these guard: consumeFilter used to INCR and then EXPIRE only
// when the count came back as 1, leaving a window in which the key existed with
// no TTL at all. Lose that EXPIRE -- a dropped connection, a restart, an Upstash
// hiccup -- and the key never expires. Once it reaches the allowance,
// hasFilterQuota is false forever and nothing in the codebase resets it, while
// getFilterUsage maps ttl === -1 to resetInSeconds: 0, so the UI reports "0s
// until reset" for the rest of the account's life.
//
// None of this could be tested before: FakeRedis had no way to make a command
// fail, so the failure paths src/ documents were unreachable from a test.
describe("consumeFilter when Redis misbehaves", () => {
    test("the key carries an expiry from the very first use", async () => {
        await consumeFilter("sess-ttl");

        expect(await redis.ttl("daily_usage:sess-ttl")).toBe(FILTER_WINDOW_SECONDS);
    });

    // The exact failure: the expiry is set up front, so losing a later command
    // cannot strand the key.
    test("a dropped EXPIRE cannot strand the key without a TTL", async () => {
        redis.failCommand("expire");

        await consumeFilter("sess-1");
        redis.healCommand("expire");

        expect(await redis.ttl("daily_usage:sess-1")).toBeGreaterThan(0);
    });

    test("the allowance still comes back after a dropped EXPIRE", async () => {
        redis.failCommand("expire");
        for (let i = 0; i < FREE_FILTERS_PER_DAY; i++) await consumeFilter("sess-1");
        redis.healCommand("expire");
        expect(await hasFilterQuota("sess-1")).toBe(false);

        redis.advance(FILTER_WINDOW_SECONDS * 1000 + 1);

        expect(await hasFilterQuota("sess-1")).toBe(true);
    });

    // Keys the shipped bug already stranded are healed rather than left to lock
    // those accounts out permanently.
    test("repairs a key an earlier version left with no expiry", async () => {
        redis.seed("daily_usage:legacy", "5", null); // no TTL, allowance spent
        expect(await hasFilterQuota("legacy")).toBe(false);

        await consumeFilter("legacy");

        expect(await redis.ttl("daily_usage:legacy")).toBe(FILTER_WINDOW_SECONDS);
        redis.advance(FILTER_WINDOW_SECONDS * 1000 + 1);
        expect(await hasFilterQuota("legacy")).toBe(true);
    });

    test("a running window is not restarted by a later use", async () => {
        await consumeFilter("sess-1");
        redis.advance(60 * 60 * 1000);
        await consumeFilter("sess-1");

        expect(await redis.ttl("daily_usage:sess-1")).toBe(FILTER_WINDOW_SECONDS - 3600);
    });

    // By the time consumeFilter runs, both clients have been sent "matched" and
    // joined to the room. Throwing here unwound to the join-queue catch, which
    // emitted queue-error to the joiner alone -- so one side returned to idle
    // while the other sat in a chat with a partner who had silently left.
    test("a total Redis failure does not abort a match already announced", async () => {
        redis.failCommand("incr");
        redis.failCommand("set");

        expect(consumeFilter("sess-1")).resolves.toBeUndefined();
    });

    test("a quota read failure reports a full allowance rather than blocking", async () => {
        redis.failCommand("get");

        expect(await getFilterUsage("sess-1")).toEqual({
            used: 0,
            remaining: FREE_FILTERS_PER_DAY,
            total: FREE_FILTERS_PER_DAY,
            resetInSeconds: 0
        });
    });

    test("matchmaking is never blocked by a quota read failure", async () => {
        redis.failCommand("get");

        expect(await hasFilterQuota("sess-1")).toBe(true);
    });
});
