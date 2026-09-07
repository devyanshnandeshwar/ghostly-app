import { describe, expect, test } from "bun:test";
import { MAX_REMEMBERED_MATCHES, rememberMatchUpdate } from "./matchHistory";

// pastMatches grew with $addToSet and was pruned by nothing. Every match
// appended an id to both users, forever: the array rode along in the cached
// session view, and previously into every queue entry as serialised JSON. A
// heavy user carried hundreds of kilobytes of history into every join, and the
// 16MB document ceiling sat at the end of the road.

describe("rememberMatchUpdate", () => {
    test("appends the partner", () => {
        const update = rememberMatchUpdate("partner-1");

        expect(update.$push.pastMatches.$each).toEqual(["partner-1"]);
    });

    test("keeps only the most recent entries", () => {
        const update = rememberMatchUpdate("partner-1");

        // Negative $slice keeps the TAIL, which is the recent end.
        expect(update.$push.pastMatches.$slice).toBe(-MAX_REMEMBERED_MATCHES);
    });

    test("bounds the array at a size a document can carry comfortably", () => {
        // Each entry is a 24-character ObjectId. The cap has to leave the
        // document far below Mongo's 16MB limit and the view cheap to cache.
        expect(MAX_REMEMBERED_MATCHES).toBeGreaterThan(50);
        expect(MAX_REMEMBERED_MATCHES).toBeLessThanOrEqual(500);
    });
});
