import { describe, expect, test, beforeEach } from "bun:test";
import { InMemoryQueueStore } from "./queue.store";
import type { QueueEntry } from "./queue.store";

// Matchmaking had no test coverage at all. These pin the pairing rules as they
// actually behave before the storage underneath them changes, so the refactor
// is provably behaviour-preserving rather than hopefully so.

let store: InMemoryQueueStore;
let now: number;

const user = (over: Partial<QueueEntry> & Pick<QueueEntry, "sessionId">): QueueEntry => ({
    socketId: `sock-${over.sessionId}`,
    gender: "male",
    preference: "any",
    pastMatches: [],
    nickname: over.sessionId,
    bio: "",
    queuedAt: now,
    ...over
});

beforeEach(() => {
    now = 1_000;
    store = new InMemoryQueueStore(() => now);
});

describe("pairing rules", () => {
    test("nobody waiting means no match", () => {
        expect(store.claimMatch(user({ sessionId: "a" }))).toBeNull();
    });

    test("a man seeking anyone matches a waiting woman seeking men", () => {
        store.enqueue(user({ sessionId: "w", gender: "female", preference: "male" }));

        const claimed = store.claimMatch(user({ sessionId: "m", gender: "male", preference: "any" }));

        expect(claimed?.sessionId).toBe("w");
    });

    test("a man seeking women does not match a woman seeking women", () => {
        store.enqueue(user({ sessionId: "w", gender: "female", preference: "female" }));

        expect(store.claimMatch(user({ sessionId: "m", gender: "male", preference: "female" }))).toBeNull();
    });

    test("a man seeking women matches a woman with no preference", () => {
        store.enqueue(user({ sessionId: "w", gender: "female", preference: "any" }));

        const claimed = store.claimMatch(user({ sessionId: "m", gender: "male", preference: "female" }));

        expect(claimed?.sessionId).toBe("w");
    });

    test("two men seeking anyone match each other", () => {
        store.enqueue(user({ sessionId: "m1", gender: "male", preference: "any" }));

        const claimed = store.claimMatch(user({ sessionId: "m2", gender: "male", preference: "any" }));

        expect(claimed?.sessionId).toBe("m1");
    });
});

describe("claiming removes the partner", () => {
    test("a claimed partner cannot be claimed twice", () => {
        store.enqueue(user({ sessionId: "w", gender: "female", preference: "any" }));

        store.claimMatch(user({ sessionId: "m1", gender: "male", preference: "any" }));

        expect(store.claimMatch(user({ sessionId: "m2", gender: "male", preference: "any" }))).toBeNull();
        expect(store.size).toBe(0);
    });
});

describe("exclusions", () => {
    test("skips someone already matched before", () => {
        store.enqueue(user({ sessionId: "w", gender: "female", preference: "any" }));

        const claimed = store.claimMatch(
            user({ sessionId: "m", gender: "male", preference: "any", pastMatches: ["w"] })
        );

        expect(claimed).toBeNull();
    });

    test("skips someone who has us in THEIR history, not just ours", () => {
        store.enqueue(
            user({ sessionId: "w", gender: "female", preference: "any", pastMatches: ["m"] })
        );

        expect(store.claimMatch(user({ sessionId: "m", gender: "male", preference: "any" }))).toBeNull();
    });

    test("never matches a session with itself", () => {
        store.enqueue(user({ sessionId: "a", gender: "male", preference: "any" }));

        expect(store.claimMatch(user({ sessionId: "a", gender: "male", preference: "any" }))).toBeNull();
    });

    // The old implementation read only the first five candidates, so a user
    // whose first five were all past matches was enqueued as if the queue were
    // empty -- while a valid partner sat at position six.
    test("looks past the first five ineligible candidates", () => {
        const seen: string[] = [];
        for (let i = 0; i < 5; i++) {
            const id = `old-${i}`;
            seen.push(id);
            store.enqueue(user({ sessionId: id, gender: "female", preference: "any" }));
        }
        store.enqueue(user({ sessionId: "fresh", gender: "female", preference: "any" }));

        const claimed = store.claimMatch(
            user({ sessionId: "m", gender: "male", preference: "any", pastMatches: seen })
        );

        expect(claimed?.sessionId).toBe("fresh");
    });
});

describe("removal and re-entry", () => {
    test("removes by socket id", () => {
        store.enqueue(user({ sessionId: "a", socketId: "sock-1" }));

        expect(store.removeBySocket("sock-1")).toBe(true);
        expect(store.size).toBe(0);
    });

    test("removing an unknown socket reports nothing removed", () => {
        expect(store.removeBySocket("nope")).toBe(false);
    });

    test("re-joining replaces the earlier entry rather than duplicating it", () => {
        store.enqueue(user({ sessionId: "a", socketId: "sock-old" }));
        store.enqueue(user({ sessionId: "a", socketId: "sock-new" }));

        expect(store.size).toBe(1);
        expect(store.removeBySocket("sock-old")).toBe(false);
        expect(store.removeBySocket("sock-new")).toBe(true);
    });
});

describe("stale entries", () => {
    // The Redis implementation needed a 60-second poller sweeping entries whose
    // socket had died with its process. In memory the entries die with the
    // process, so the poller is gone -- but a socket that lingers without
    // disconnecting cleanly still must not be offered forever.
    test("does not offer an entry older than the maximum wait", () => {
        store.enqueue(user({ sessionId: "w", gender: "female", preference: "any" }));

        now += store.maxWaitMs + 1;

        expect(store.claimMatch(user({ sessionId: "m", gender: "male", preference: "any" }))).toBeNull();
        expect(store.size).toBe(0);
    });
});
