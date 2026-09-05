import { describe, expect, test, beforeEach, mock } from "bun:test";
import { FakeRedis } from "../testing/fakeRedis";
import { FREE_FILTERS_PER_DAY, FILTER_WINDOW_SECONDS } from "@shared/constants";
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
        expect(await getFilterUsage("sess-new")).toEqual({ used: 0, resetInSeconds: 0 });
    });

    test("reports what has actually been consumed", async () => {
        await consumeFilter("sess-1");
        await consumeFilter("sess-1");

        const usage = await getFilterUsage("sess-1");

        expect(usage.used).toBe(2);
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
        expect(await getFilterUsage("sess-1")).toEqual({ used: 0, resetInSeconds: 0 });
    });
});
