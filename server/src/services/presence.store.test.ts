import { describe, expect, test, beforeEach } from "bun:test";
import { InMemoryPresenceStore, PRESENCE_TTL_MS } from "./presence.store";

// Presence describes which live socket is in which room. It used to live in
// Redis so that a second instance could read it; the free tier runs one
// instance, and a spin-down destroys every socket, so a Redis row describing a
// socket outlives the thing it describes. Keeping it in process also takes a
// Redis read off every chat message and every typing event.

describe("InMemoryPresenceStore", () => {
    let store: InMemoryPresenceStore;
    let now: number;

    beforeEach(() => {
        now = 1_000_000;
        store = new InMemoryPresenceStore(() => now);
    });

    test("returns null for a socket that was never matched", async () => {
        expect(await store.get("nobody")).toBeNull();
    });

    test("round-trips a match", async () => {
        await store.set("sock-a", { partnerSessionId: "sess-b", roomId: "room-1" });

        expect(await store.get("sock-a")).toEqual({
            partnerSessionId: "sess-b",
            roomId: "room-1"
        });
    });

    test("keeps sockets independent", async () => {
        await store.set("sock-a", { partnerSessionId: "sess-b", roomId: "room-1" });
        await store.set("sock-b", { partnerSessionId: "sess-a", roomId: "room-1" });

        await store.clear("sock-a");

        expect(await store.get("sock-a")).toBeNull();
        expect(await store.get("sock-b")).not.toBeNull();
    });

    test("clearing a socket that was never set is not an error", async () => {
        await store.clear("ghost");
        expect(await store.get("ghost")).toBeNull();
    });

    // Without this the map is a leak: a socket whose disconnect handler never
    // ran holds its entry forever. Redis had a TTL for exactly this reason and
    // dropping to memory must not drop the safety net with it.
    test("expires an entry whose socket never disconnected cleanly", async () => {
        await store.set("sock-a", { partnerSessionId: "sess-b", roomId: "room-1" });

        now += PRESENCE_TTL_MS + 1;

        expect(await store.get("sock-a")).toBeNull();
    });

    test("does not expire an entry inside its window", async () => {
        await store.set("sock-a", { partnerSessionId: "sess-b", roomId: "room-1" });

        now += PRESENCE_TTL_MS - 1;

        expect(await store.get("sock-a")).not.toBeNull();
    });

    test("reclaims expired entries rather than growing without bound", async () => {
        for (let i = 0; i < 50; i++) {
            await store.set(`sock-${i}`, { partnerSessionId: "s", roomId: "r" });
        }
        expect(store.size).toBe(50);

        now += PRESENCE_TTL_MS + 1;
        await store.set("fresh", { partnerSessionId: "s", roomId: "r" });

        // The stale 50 are gone, swept on write rather than by a timer.
        expect(store.size).toBe(1);
    });
});
