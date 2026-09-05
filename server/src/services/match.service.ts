import { InMemoryQueueStore, type QueueEntry, type QueueStore } from "./queue.store";

/**
 * Matchmaking orchestration: cooldowns, then the queue store.
 *
 * Everything here used to be Redis. See queue.store.ts for why it is not any
 * more. The periodic reconcileQueues sweep is gone with it -- it existed to
 * evict entries whose socket died with a process that never ran its handlers,
 * and entries that live in that process cannot outlive it.
 */

const queue: QueueStore = new InMemoryQueueStore();

/**
 * How long a skip blocks the next search.
 *
 * Exported because match.socket.ts reports this number to the client. The two
 * used to disagree -- the client was told 5 and Redis was given 30 -- so every
 * skip produced a countdown that lied and then a refusal 25 seconds later.
 */
export const SKIP_COOLDOWN_SECONDS = 5;

/** sessionId -> epoch ms at which the cooldown lifts. */
const cooldowns = new Map<string, number>();

export interface CooldownResult {
    error: "cooldown";
    remaining: number;
}

export interface MatchResult {
    user1: QueueEntry;
    user2: QueueEntry;
}

function cooldownRemaining(sessionId: string): number {
    const until = cooldowns.get(sessionId);
    if (until === undefined) return 0;

    const remainingMs = until - Date.now();
    if (remainingMs <= 0) {
        cooldowns.delete(sessionId);
        return 0;
    }

    return Math.ceil(remainingMs / 1000);
}

export function setCooldown(sessionId: string): void {
    cooldowns.set(sessionId, Date.now() + SKIP_COOLDOWN_SECONDS * 1000);
}

export function clearCooldown(sessionId: string): void {
    cooldowns.delete(sessionId);
}

/**
 * Finds a partner, or takes a place in the queue.
 *
 * Returns a cooldown notice, a pair, or null when the caller is now waiting.
 */
export function addToQueue(
    newUser: Omit<QueueEntry, "queuedAt">
): CooldownResult | MatchResult | null {
    const remaining = cooldownRemaining(newUser.sessionId);
    if (remaining > 0) {
        return { error: "cooldown", remaining };
    }

    const entry: QueueEntry = { ...newUser, queuedAt: Date.now() };

    const partner = queue.claimMatch(entry);
    if (partner) {
        // Neither party should be held by a cooldown from a skip that has now
        // produced a match.
        clearCooldown(entry.sessionId);
        clearCooldown(partner.sessionId);
        return { user1: entry, user2: partner };
    }

    queue.enqueue(entry);
    return null;
}

/** Removes a socket's place in the queue, if it holds one. */
export function removeFromQueue(socketId: string): void {
    queue.removeBySocket(socketId);
}
