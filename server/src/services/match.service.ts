import { InMemoryQueueStore, type QueueEntry, type QueueStore } from "./queue.store";

/**
 * Matchmaking orchestration: cooldowns, then the queue store.
 *
 * Everything here used to be Redis. See queue.store.ts for why it is not any
 * more. The periodic reconcileQueues sweep is gone with it -- it existed to
 * evict entries whose socket died with a process that never ran its handlers,
 * and entries that live in that process cannot outlive it.
 */

/**
 * How long a skip blocks the next search.
 *
 * Exported because match.socket.ts reports this number to the client. The two
 * used to disagree -- the client was told 5 and Redis was given 30 -- so every
 * skip produced a countdown that lied and then a refusal 25 seconds later.
 */
export const SKIP_COOLDOWN_SECONDS = 5;

export interface CooldownResult {
    error: "cooldown";
    remaining: number;
}

export interface MatchResult {
    user1: QueueEntry;
    user2: QueueEntry;
}

/**
 * Builds a matchmaking service over its own queue and clock.
 *
 * The module used to hold both as bare module-level constants and call
 * Date.now() directly, which is why match.service.test.ts had to document
 * working around shared process-wide state -- and why cooldown *expiry*, the
 * entire point of the cooldown, could not be tested at all. The default
 * instance below preserves the previous exports exactly.
 */
export function createMatchService(
    deps: { queue?: QueueStore; now?: () => number } = {}
) {
    const now = deps.now ?? Date.now;
    const queue = deps.queue ?? new InMemoryQueueStore(now);

    /** sessionId -> epoch ms at which the cooldown lifts. */
    const cooldowns = new Map<string, number>();

    function cooldownRemaining(sessionId: string): number {
        const until = cooldowns.get(sessionId);
        if (until === undefined) return 0;

        const remainingMs = until - now();
        if (remainingMs <= 0) {
            cooldowns.delete(sessionId);
            return 0;
        }

        return Math.ceil(remainingMs / 1000);
    }

    function setCooldown(sessionId: string): void {
        cooldowns.set(sessionId, now() + SKIP_COOLDOWN_SECONDS * 1000);
    }

    function clearCooldown(sessionId: string): void {
        cooldowns.delete(sessionId);
    }

    /**
     * Finds a partner, or takes a place in the queue.
     *
     * Returns a cooldown notice, a pair, or null when the caller is now waiting.
     */
    function addToQueue(newUser: Omit<QueueEntry, "queuedAt">): CooldownResult | MatchResult | null {
        const remaining = cooldownRemaining(newUser.sessionId);
        if (remaining > 0) {
            return { error: "cooldown", remaining };
        }

        const entry: QueueEntry = { ...newUser, queuedAt: now() };

        const partner = queue.claimMatch(entry);
        if (partner) {
            // A session may hold only one place in the queue, and this is the
            // path that used to forget it. enqueue() dedupes below, so the
            // no-match path was safe; claiming a match returned without
            // clearing anything, stranding whatever entry the caller already
            // held.
            //
            // It takes a preference change to reach. With an unchanged filter
            // the second search covers exactly the buckets the first did, so
            // anyone claimable would already have claimed the first entry.
            // Change the filter and the second search reaches buckets the first
            // never did: the caller matches out of one of those while their
            // original entry sits untouched where nobody looks again.
            //
            // MatchContext.findMatch has no status guard, so a user waiting in
            // the queue who switches their gender filter and searches again
            // emits a second join-queue with no leave-queue in between. The
            // orphan is then handed to a third user, who is paired with someone
            // already in a conversation -- and setActiveMatch overwrites the
            // first partner's presence, so that partner's messages start being
            // dropped by the room check with no partner-left to explain it.
            queue.removeBySession(entry.sessionId);

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
    function removeFromQueue(socketId: string): void {
        queue.removeBySocket(socketId);
    }

    return { addToQueue, removeFromQueue, setCooldown, clearCooldown, cooldownRemaining, queue };
}

const defaultService = createMatchService();

export const addToQueue = defaultService.addToQueue;
export const removeFromQueue = defaultService.removeFromQueue;
export const setCooldown = defaultService.setCooldown;
export const clearCooldown = defaultService.clearCooldown;
