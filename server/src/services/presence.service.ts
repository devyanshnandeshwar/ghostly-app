import { InMemoryPresenceStore, type ActiveMatch, type PresenceStore } from "./presence.store";

/**
 * Process-wide presence, behind the store interface so the backing choice is
 * one line rather than a change to every caller. See presence.store.ts for why
 * this is in memory rather than Redis.
 */
const store: PresenceStore = new InMemoryPresenceStore();

export type { ActiveMatch };

export async function setActiveMatch(socketId: string, match: ActiveMatch) {
    await store.set(socketId, match);
}

export async function getActiveMatch(socketId: string): Promise<ActiveMatch | null> {
    return store.get(socketId);
}

export async function clearActiveMatch(socketId: string) {
    await store.clear(socketId);
}
