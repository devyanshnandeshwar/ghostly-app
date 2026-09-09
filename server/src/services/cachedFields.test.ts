import { describe, expect, test, mock } from "bun:test";

// touchesCachedField decides whether a write invalidates the cached queue view,
// and its own comment warns that "a field cached but missing here would go
// stale, silently". It is pure -- an update object in, a boolean out -- and it
// had no tests, because it was not exported.
//
// What it protects: a ban that does not invalidate leaves the account matchable
// for a full cache TTL, and a pastMatches write that does not invalidate pairs
// two people who have just been together straight back up. Both fail silently.

mock.module("../models/UserSession", () => ({ UserSession: {} }));
mock.module("../config/redis", () => ({
    redisClient: {},
    redisReady: Promise.resolve(),
    connectRedis: async () => {}
}));

// A static import is safe: mock.module patches the live binding even for a
// module already resolved.
import { touchesCachedField } from "./session.service";

describe("updates that must invalidate the cached view", () => {
    test.each([
        ["a ban", { status: "banned" }],
        ["verification", { isVerified: true }],
        ["gender", { gender: "female" }],
        ["the gender filter", { preference: "male" }],
        ["a nickname", { nickname: "Ada" }],
        ["a bio", { bio: "hello" }],
        ["the age declaration", { ageConfirmedAt: new Date() }]
    ])("%s", (_label, update) => {
        expect(touchesCachedField(update)).toBe(true);
    });

    test("match history, whichever operator writes it", () => {
        expect(touchesCachedField({ pastMatches: ["a"] })).toBe(true);
        expect(touchesCachedField({ $set: { pastMatches: ["a"] } })).toBe(true);
        expect(touchesCachedField({ $push: { pastMatches: "a" } })).toBe(true);
        expect(touchesCachedField({ $addToSet: { pastMatches: "a" } })).toBe(true);
    });

    test("a cached field nested under a dotted path", () => {
        expect(touchesCachedField({ $set: { "pastMatches.0": "a" } })).toBe(true);
    });

    test("a mixed update where only one field is cached", () => {
        expect(touchesCachedField({ lastActive: new Date(), status: "limited" })).toBe(true);
    });

    test("a $set that combines a cached and an uncached field", () => {
        expect(
            touchesCachedField({ $set: { lastActive: new Date(), nickname: "Ada" } })
        ).toBe(true);
    });
});

describe("updates that need not invalidate", () => {
    // Skipping the invalidation for these is the optimisation the function
    // exists for -- lastActive is written on a throttle for every active
    // session, and paying a cache eviction for it would defeat the cache.
    test.each([
        ["the activity timestamp", { lastActive: new Date() }],
        ["the lifetime filter counter", { $inc: { dailyFilterUsage: 1 } }],
        ["the token version", { $inc: { tokenVersion: 1 } }],
        ["nothing at all", {}]
    ])("%s", (_label, update) => {
        expect(touchesCachedField(update)).toBe(false);
    });
});

describe("shapes that must not throw", () => {
    test("an operator whose value is not an object", () => {
        expect(() => touchesCachedField({ $unset: "status" as any })).not.toThrow();
    });

    test("an operator whose value is null", () => {
        expect(() => touchesCachedField({ $set: null as any })).not.toThrow();
    });

    test("$unset of a cached field still invalidates", () => {
        expect(touchesCachedField({ $unset: { gender: "" } })).toBe(true);
    });
});
