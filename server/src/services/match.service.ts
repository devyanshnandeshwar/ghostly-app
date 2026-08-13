import { Server } from "socket.io";
import { QueueUser, Gender } from "@shared/types/User";
import { logger } from "../utils/logger";
import { redisClient } from "../config/redis";

// Queue Key Constants
const QUEUE_PREFIX = "ghosty:queue";
const COOLDOWN_PREFIX = "ghosty:cooldown";
const INDEX_PREFIX = "ghosty:queue:index";

// Safety net so an index entry can never outlive its queue entry forever.
const INDEX_TTL_SECONDS = 60 * 60;

function getQueueKey(gender: string, preference: string): string {
    return `${QUEUE_PREFIX}:${gender}:${preference}`;
}

function getCooldownKey(sessionId: string): string {
    return `${COOLDOWN_PREFIX}:${sessionId}`;
}

// Reverse index: socketId -> where that socket's queue entry lives.
// Without it, cleaning up on disconnect would mean scanning every queue.
function getIndexKey(socketId: string): string {
    return `${INDEX_PREFIX}:${socketId}`;
}

async function indexQueueEntry(socketId: string, queueKey: string, entry: string) {
    await redisClient.setEx(
        getIndexKey(socketId),
        INDEX_TTL_SECONDS,
        JSON.stringify({ queueKey, entry })
    );
}

export async function addToQueue(newUser: QueueUser) {
    const { sessionId, gender, preference } = newUser;

    // 1. Check Cooldown
    const cooldownKey = getCooldownKey(sessionId);
    const ttl = await redisClient.ttl(cooldownKey);
    if (ttl > 0) {
        return { error: "cooldown", remaining: ttl };
    }

    // 2. Search for Match
    let queuesToCheck: string[] = [];

    if (preference === "any") {
        if (gender === "male") {
            queuesToCheck = [
                getQueueKey("female", "male"),
                getQueueKey("male", "male"),
                getQueueKey("female", "any"),
                getQueueKey("male", "any")
            ];
        } else {
             queuesToCheck = [
                getQueueKey("male", "female"),
                getQueueKey("female", "female"),
                getQueueKey("male", "any"),
                getQueueKey("female", "any")
            ];
        }
    } else {
        const targetGender = preference;
        queuesToCheck = [
            getQueueKey(targetGender, gender), 
            getQueueKey(targetGender, "any")   
        ];
    }

    // 3. Try to POP a match
    for (const queueKey of queuesToCheck) {
        const candidatesRaw = await redisClient.lRange(queueKey, 0, 4);
        if (!candidatesRaw || candidatesRaw.length === 0) continue;

        for (let i = 0; i < candidatesRaw.length; i++) {
             const candidateRaw = candidatesRaw[i];
             const candidate: QueueUser = JSON.parse(candidateRaw);

             // Check collision with Self
             if (candidate.sessionId === sessionId) {
                 await redisClient.lRem(queueKey, 1, candidateRaw); // Remove stale self
                 await redisClient.del(getIndexKey(candidate.socketId));
                 continue;
             }

             // Check Past Matches
             if (newUser.pastMatches.includes(candidate.sessionId) || candidate.pastMatches.includes(sessionId)) {
                 continue; // Skip this candidate, try next
             }

             // FOUND VALID MATCH - Try to claim atomically
             const removedCount = await redisClient.lRem(queueKey, 1, candidateRaw);
             if (removedCount === 1) {
                 // Successfully claimed
                 await redisClient.del(getIndexKey(candidate.socketId));
                 await redisClient.del(cooldownKey);
                 await redisClient.del(getCooldownKey(candidate.sessionId));

                 return {
                     user1: newUser,
                     user2: candidate
                 };
             }
             // If removedCount is 0, someone else claimed them first! Try next candidate.
        }
    }

    // 4. No Match Found -> Enqueue Myself
    const myQueueKey = getQueueKey(gender, preference);
    
    // Remove existing entry to prevent duplicates
    const allMyEntriesRaw = await redisClient.lRange(myQueueKey, 0, -1);
    for (const entryRaw of allMyEntriesRaw) {
        const entry: QueueUser = JSON.parse(entryRaw);
        if (entry.sessionId === sessionId) {
            await redisClient.lRem(myQueueKey, 1, entryRaw);
            await redisClient.del(getIndexKey(entry.socketId));
        }
    }

    const myEntry = JSON.stringify({ ...newUser, queuedAt: Date.now() });
    await redisClient.rPush(myQueueKey, myEntry);
    await indexQueueEntry(newUser.socketId, myQueueKey, myEntry);
    return null;
}

/**
 * Removes a disconnected socket's queue entry via the reverse index, so a
 * dropped user is not offered as a match to someone else.
 */
export async function removeFromQueue(socketId: string) {
    const indexKey = getIndexKey(socketId);
    const raw = await redisClient.get(indexKey);

    if (!raw) return;

    try {
        const { queueKey, entry } = JSON.parse(raw);
        await redisClient.lRem(queueKey, 1, entry);
    } catch (error: any) {
        logger.warn(`Failed to clean queue entry for ${socketId}: ${error.message}`);
    }

    await redisClient.del(indexKey);
}

export async function removeUserFromQueue(user: QueueUser) {
    // Fast path: the reverse index points straight at the entry, so a skip
    // costs one lookup instead of reading the whole queue.
    const indexKey = getIndexKey(user.socketId);
    const raw = await redisClient.get(indexKey);

    if (raw) {
        try {
            const { queueKey, entry } = JSON.parse(raw);
            await redisClient.lRem(queueKey, 1, entry);
            await redisClient.del(indexKey);
            await setCooldown(user.sessionId);
            return;
        } catch (error: any) {
            logger.warn(`Queue index unreadable for ${user.socketId}: ${error.message}`);
        }
    }

    // Fallback: the index expired or was never written. Scan the one queue
    // this user would be in rather than leaving a stale entry behind.
    const queueKey = getQueueKey(user.gender, user.preference);
    const allEntriesRaw = await redisClient.lRange(queueKey, 0, -1);
    for (const entryRaw of allEntriesRaw) {
        const entry: QueueUser = JSON.parse(entryRaw);
        if (entry.sessionId === user.sessionId) {
            await redisClient.lRem(queueKey, 1, entryRaw);
            await redisClient.del(getIndexKey(entry.socketId));
        }
    }

    // Set Cooldown
    await setCooldown(user.sessionId);
}

export async function setCooldown(sessionId: string) {
    // 30 Seconds Cooldown
    await redisClient.setEx(getCooldownKey(sessionId), 30, "1");
}

// Every queue key that can exist, so reconciliation never has to SCAN (and can
// never accidentally sweep the index keys, which share the ghosty:queue prefix).
const ALL_QUEUE_KEYS: string[] = (["male", "female"] as const).flatMap((gender) =>
    (["male", "female", "any"] as const).map((preference) => getQueueKey(gender, preference))
);

// A socket that enqueued moments ago may not be visible to a peer that has not
// finished adapter discovery. Never evict an entry younger than this.
const RECONCILE_GRACE_MS = 60_000;

/**
 * Drops queue entries whose socket is no longer connected anywhere in the
 * cluster.
 *
 * removeFromQueue covers the normal disconnect path, but entries still leak
 * when a process dies without running its handlers -- a crash, an OOM kill, or
 * a deploy. Whoever matched against such an entry would land in a chat with a
 * partner who never speaks, so the queue is swept periodically rather than only
 * on disconnect.
 *
 * Returns the number of entries removed.
 */
export async function reconcileQueues(io: Server): Promise<number> {
    let live: Set<string>;

    try {
        // Cluster-wide, not just this instance: with the Redis adapter another
        // process may legitimately own the socket behind a queue entry.
        live = await io.of("/").adapter.sockets(new Set());
    } catch (error: any) {
        // Incomplete information is not grounds for eviction.
        logger.warn(`[Queue] Skipping reconcile, socket census failed: ${error.message}`);
        return 0;
    }

    const now = Date.now();
    let removed = 0;

    for (const queueKey of ALL_QUEUE_KEYS) {
        const entriesRaw = await redisClient.lRange(queueKey, 0, -1);

        for (const raw of entriesRaw) {
            let entry: QueueUser;

            try {
                entry = JSON.parse(raw);
            } catch {
                // Unparseable entries can never match anyone.
                await redisClient.lRem(queueKey, 1, raw);
                removed++;
                continue;
            }

            if (live.has(entry.socketId)) continue;

            // Entries predating queuedAt are from an older build and are, by
            // definition, left over from a process that is no longer running.
            const age = now - (entry.queuedAt ?? 0);
            if (age < RECONCILE_GRACE_MS) continue;

            await redisClient.lRem(queueKey, 1, raw);
            await redisClient.del(getIndexKey(entry.socketId));
            removed++;
        }
    }

    if (removed > 0) {
        logger.info(`[Queue] Reconciled ${removed} orphaned entr${removed === 1 ? "y" : "ies"}`);
    }

    return removed;
}
