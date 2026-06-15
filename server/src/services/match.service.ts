import { QueueUser, Gender } from "@shared/types/User";
import { logger } from "../utils/logger";
import { redisClient } from "../config/redis";

// Queue Key Constants
const QUEUE_PREFIX = "ghosty:queue";
const COOLDOWN_PREFIX = "ghosty:cooldown";

function getQueueKey(gender: string, preference: string): string {
    return `${QUEUE_PREFIX}:${gender}:${preference}`;
}

function getCooldownKey(sessionId: string): string {
    return `${COOLDOWN_PREFIX}:${sessionId}`;
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
        }
    }

    await redisClient.rPush(myQueueKey, JSON.stringify(newUser));
    return null;
}

export async function removeFromQueue(socketId: string) {
    // Scan all queues and remove by socketId logic is too expensive in Redis without a reverse index.
    // However, removeUserFromQueue is the main one used.
}

export async function removeUserFromQueue(user: QueueUser) {
    const queueKey = getQueueKey(user.gender, user.preference);
    
    const allEntriesRaw = await redisClient.lRange(queueKey, 0, -1);
    for (const entryRaw of allEntriesRaw) {
        const entry: QueueUser = JSON.parse(entryRaw);
        if (entry.sessionId === user.sessionId) {
            await redisClient.lRem(queueKey, 1, entryRaw);
        }
    }
    
    // Set Cooldown
    await setCooldown(user.sessionId);
}

export async function setCooldown(sessionId: string) {
    // 30 Seconds Cooldown
    await redisClient.setEx(getCooldownKey(sessionId), 30, "1");
}
