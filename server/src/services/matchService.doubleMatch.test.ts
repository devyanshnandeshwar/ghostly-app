import { describe, expect, test } from "bun:test";
import { createMatchService } from "./match.service";
import { InMemoryQueueStore, type QueueEntry } from "./queue.store";

// The regression this guards: addToQueue deduped the caller only on the
// no-match path. enqueue() calls removeBySession, but claiming a match returned
// straight out without clearing anything -- so any entry the caller already
// held stayed in the queue for someone else to claim.
//
// Reaching it needs the caller's PREFERENCE to differ between the two joins.
// With an unchanged preference the second join searches exactly the buckets the
// first one did, so anyone claimable would already have claimed the first entry
// -- nothing is stranded. Change the filter, though, and the second search
// covers buckets the first never did: the caller matches out of one of those
// while their original entry sits untouched in a bucket nobody revisited.
//
// That is a normal thing to do. MatchContext.findMatch has no status guard, so
// a user sitting in "waiting" who switches their gender filter and searches
// again emits a second join-queue with no leave-queue in between.
//
// The orphan is then handed to a third user, who is paired with someone already
// in a conversation. setActiveMatch overwrites the first partner's presence, so
// every message that partner sends is silently dropped by isInRoom and they are
// never sent partner-left. They just watch a live chat go mute.

function clock(start = 1_000_000) {
    let t = start;
    return { now: () => t, advance: (ms: number) => (t += ms) };
}

const user = (
    sessionId: string,
    socketId: string,
    gender: "male" | "female",
    preference: "male" | "female" | "any"
) => ({ sessionId, socketId, gender, preference, pastMatches: [] as string[], nickname: sessionId, bio: "" });

function service(now = Date.now) {
    const queue = new InMemoryQueueStore(now);
    return { svc: createMatchService({ queue, now }), queue };
}

describe("a session never holds two places in the queue", () => {
    test("matching after a filter change clears the entry the first search left", () => {
        const { svc, queue } = service();

        // Alice searches for men. Nobody is waiting, so she takes a place.
        svc.addToQueue(user("alice", "S_a1", "female", "male"));
        // Yara wants women. She never searches female:male, so Alice stays put.
        svc.addToQueue(user("yara", "S_y", "female", "female"));
        expect(queue.size).toBe(2);

        // Alice switches her filter to "anyone" and searches again.
        const result = svc.addToQueue(user("alice", "S_a2", "female", "any"));

        expect(result).toMatchObject({ user2: { sessionId: "yara" } });
        expect(queue.size).toBe(0);
    });

    // The consequence, end to end: a third user must not be able to claim
    // someone who is already in a conversation.
    test("a third user cannot be matched with someone already in a chat", () => {
        const { svc } = service();

        svc.addToQueue(user("alice", "S_a1", "female", "male"));
        svc.addToQueue(user("yara", "S_y", "female", "female"));
        svc.addToQueue(user("alice", "S_a2", "female", "any")); // alice <-> yara

        const dave = svc.addToQueue(user("dave", "S_d", "male", "female"));

        expect(dave).toBeNull(); // dave waits; there is nobody free
    });

    test("matching on a first search strands nothing", () => {
        const { svc, queue } = service();

        svc.addToQueue(user("bob", "S_b", "male", "any"));
        svc.addToQueue(user("dana", "S_d", "female", "any"));

        expect(queue.size).toBe(0);
    });

    test("a repeated search that finds nobody replaces the earlier entry", () => {
        const { svc, queue } = service();

        svc.addToQueue(user("alice", "S_a1", "female", "male"));
        svc.addToQueue(user("alice", "S_a2", "female", "male"));

        expect(queue.size).toBe(1);
    });

    test("a filter change that finds nobody leaves nothing in the old bucket", () => {
        const { svc, queue } = service();

        svc.addToQueue(user("alice", "S_a1", "female", "male"));
        svc.addToQueue(user("alice", "S_a2", "female", "female"));

        expect(queue.size).toBe(1);
    });

    test("the surviving entry is the newest one, carrying the new filter", () => {
        const { svc } = service();

        svc.addToQueue(user("alice", "S_a1", "female", "male"));
        svc.addToQueue(user("alice", "S_a2", "female", "female"));

        // Only someone matching the NEW filter should find her.
        expect(svc.addToQueue(user("dave", "S_d", "male", "female"))).toBeNull();
        expect(svc.addToQueue(user("yara", "S_y", "female", "female"))).toMatchObject({
            user2: { sessionId: "alice" }
        });
    });
});

// Cooldown expiry could not be tested before: the module held one process-wide
// Map and called Date.now() directly, so a test could only observe that a
// cooldown existed, never that it lifted.
describe("skip cooldown over time", () => {
    test("blocks a rejoin while it is running", () => {
        const c = clock();
        const { svc } = service(c.now);

        svc.setCooldown("alice");

        expect(svc.addToQueue(user("alice", "S_a", "female", "any"))).toEqual({
            error: "cooldown",
            remaining: 5
        });
    });

    test("counts down as time passes", () => {
        const c = clock();
        const { svc } = service(c.now);

        svc.setCooldown("alice");
        c.advance(2000);

        expect(svc.addToQueue(user("alice", "S_a", "female", "any"))).toEqual({
            error: "cooldown",
            remaining: 3
        });
    });

    test("lifts exactly when it says it will, rather than a tick late", () => {
        const c = clock();
        const { svc } = service(c.now);

        svc.setCooldown("alice");
        c.advance(5000);

        expect(svc.addToQueue(user("alice", "S_a", "female", "any"))).toBeNull();
    });

    test("rounds up, so the client is never told zero while still blocked", () => {
        const c = clock();
        const { svc } = service(c.now);

        svc.setCooldown("alice");
        c.advance(4999);

        expect(svc.addToQueue(user("alice", "S_a", "female", "any"))).toEqual({
            error: "cooldown",
            remaining: 1
        });
    });

    test("reclaims the entry once it lapses rather than holding it forever", () => {
        const c = clock();
        const { svc } = service(c.now);

        svc.setCooldown("alice");
        c.advance(5000);
        svc.addToQueue(user("alice", "S_a", "female", "any"));

        // A second search must not be refused by a cooldown that already lifted.
        expect(svc.addToQueue(user("alice", "S_a", "female", "any"))).toBeNull();
    });

    test("a cooldown on one session does not block another", () => {
        const c = clock();
        const { svc } = service(c.now);

        svc.setCooldown("alice");

        expect(svc.addToQueue(user("bob", "S_b", "male", "any"))).toBeNull();
    });

    test("a match clears the cooldown on both sides", () => {
        const c = clock();
        const { svc } = service(c.now);

        svc.addToQueue(user("carl", "S_c", "male", "any"));
        svc.setCooldown("carl");

        const result = svc.addToQueue(user("alice", "S_a", "female", "any"));

        expect(result).toMatchObject({ user2: { sessionId: "carl" } });
        expect(svc.addToQueue(user("carl", "S_c2", "male", "any"))).toBeNull();
    });
});

describe("createMatchService isolation", () => {
    test("two services do not share a queue", () => {
        const a = service();
        const b = service();

        a.svc.addToQueue(user("alice", "S_a", "female", "any"));

        expect(a.queue.size).toBe(1);
        expect(b.queue.size).toBe(0);
    });
});
