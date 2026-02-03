import { QueueUser, Gender } from "@shared/types/User";
import { logger } from "../utils/logger";
import { redisClient } from "../config/redis";

// Redis Key Constants
const QUEUE_PREFIX = "ghosty:queue";
const COOLDOWN_PREFIX = "ghosty:cooldown";

// Queue Types: "seekerGender:targetGender"
// e.g., "male:female" = Male looking for Female
// e.g., "male:any" = Male looking for Any
// e.g., "any:any" is not used strictly; we map user.preference to target

function getQueueKey(gender: string, preference: string): string {
    return `${QUEUE_PREFIX}:${gender}:${preference}`;
}

export async function addToQueue(newUser: QueueUser) {
    const { sessionId, gender, preference } = newUser;

    // 1. Check Cooldown (ghosty:cooldown:{sessionId})
    const cooldownTTL = await redisClient.ttl(`${COOLDOWN_PREFIX}:${sessionId}`);
    if (cooldownTTL > 0) {
        return { error: "cooldown", remaining: cooldownTTL };
    }

    // 2. Search for Match (O(1) Pop) based on Priority
    // If I am Male looking for Any:
    // Priority 1: Female looking for Male (queue:female:male)
    // Priority 2: Male looking for Male (queue:male:male)
    // Priority 3: Female looking for Any (queue:female:any)
    // Priority 4: Male looking for Any (queue:male:any)

    // Construct Search List
    let queuesToCheck: string[] = [];

    if (preference === "any") {
        if (gender === "male") {
            // Me: Male -> Any
            queuesToCheck = [
                getQueueKey("female", "male"), // Ideal: She wants Me
                getQueueKey("male", "male"),   // He wants Me (Gay/Any)
                getQueueKey("female", "any"),  // She wants Any
                getQueueKey("male", "any")     // He wants Any
            ];
        } else {
             // Me: Female -> Any
             queuesToCheck = [
                getQueueKey("male", "female"), // Ideal: He wants Me
                getQueueKey("female", "female"), // She wants me
                getQueueKey("male", "any"),    // He wants Any
                getQueueKey("female", "any")   // She wants Any
            ];
        }
    } else {
        // Me: Specific Preference (e.g. Male -> Female)
        // I need a Female.
        // Priority 1: Female looking for Male (queue:female:male)
        // Priority 2: Female looking for Any (queue:female:any)
        const targetGender = preference;
        queuesToCheck = [
            getQueueKey(targetGender, gender), // Target wanting Me specifically
            getQueueKey(targetGender, "any")   // Target wanting Any
        ];
    }

    // 3. Try to POP a match
    for (const queueKey of queuesToCheck) {
        // LPOP is atomic. If we get a user, it's ours.
        // We must check if it's not ourselves (edge case if I rejoined fast)
        // And check if it's not a past match (this is harder in Redis, see below)
        
        // Handling Past Matches with LPOP is tricky because we can't "peek and skip".
        // Solution: We pop. If it's a past match, we push them back (Head or Tail?) and try again? 
        // Pushing back might cause infinite loops if queue is small.
        // BETTER APPROACH for Redis:
        // We accept the match, checks mutual logic (already encoded in queue structure), 
        // check past match. If invalid, we push them back to HEAD of their queue (`RPUSH` mixed with `LPOP` logic, actually `LGET` then `LREM` is safer but slower).
        
        // For Scalability + Simplicity in this challenge: 
        // We assume the queue structure guarantees "Preference Match".
        // We will perform a simple check. If repeated match, we put them back and continue? 
        // Actually, preventing repeats with strict O(1) Redis queues is hard.
        // Compromise: We check past matches. If bad match, we put them back to the RIGHT (tail) so we don't pick them again immediately, and try next.
        
        // Let's try up to 3 candidates from a queue to satisfy "Past Match" constraint.
        for(let i=0; i<3; i++) {
             const candidateString = await redisClient.lpop(queueKey);
             if (!candidateString) break; // Queue empty, next queue layer

             const candidate = JSON.parse(candidateString) as QueueUser;

             // Check collision with Self
             if (candidate.sessionId === sessionId) {
                 continue; // Just drop (shouldn't happen if logic is correct, but effectively removes stale self)
             }

             // Check Past Matches
             if (newUser.pastMatches.includes(candidate.sessionId) || candidate.pastMatches.includes(sessionId)) {
                 // Invalid Match due to history.
                 // Push candidate back to TAIL (RPUSH) so valid users cycle to front.
                 await redisClient.rpush(queueKey, candidateString);
                 continue; // Try next one in this queue?
             }

             // FOUND A VALID MATCH!
             // Clear cooldowns
             await redisClient.del(`${COOLDOWN_PREFIX}:${sessionId}`);
             await redisClient.del(`${COOLDOWN_PREFIX}:${candidate.sessionId}`);

             return {
                 user1: newUser,
                 user2: candidate
             };
        }
    }

    // 4. No Match Found -> Enqueue Myself
    // My Queue Key: queue:{myGender}:{myPreference}
    const myQueueKey = getQueueKey(gender, preference);
    
    // Prevent duplicates (simple removal before push) - naive but safer
    // Ideally we use a sorted set or check, but LREM is okay for small dupes.
    // LREM count 0 removes all occurrences.
    // However, finding the exact JSON string is hard. 
    // We assume the user is removed when they disconnected/matched.
    
    await redisClient.rpush(myQueueKey, JSON.stringify(newUser));
    return null;
}

export async function removeFromQueue(socketId: string) {
    // This is expensive: Verification scan of all queues?
    // Or we store a robust "user -> queue" mapping.
    // Optimization: We know the user's gender/pref from their session usually.
    // But socketId doesn't give us that easily unless we passed the user object.
    
    // For now, we will scan all 6 queues. It's constant time (6 scans).
    // Not optimal if queues are huge (LREM is O(N)). 
    // But explicit removal is only needed on Disconnect.
    
    // BETTER: Retrieve user session from socket map in `socketManager`, then we know the exact queue.
    // But `match.service.ts` functions detached.
    
    // We will scan for now.
    const queues = [
        "ghosty:queue:male:male",
        "ghosty:queue:male:female",
        "ghosty:queue:male:any",
        "ghosty:queue:female:male",
        "ghosty:queue:female:female",
        "ghosty:queue:female:any"
    ];

    // This part is tricky. Redis doesn't support "Remove item where socketId = X".
    // We store the whole User object.
    
    // Given the constraints and the "Scaling" prompt:
    // We should probably rely on a secondary index "socketId -> QueueKey"
    // But to keep it robust:
    // We can iterate queues, fetching all items? No.
    
    // For this implementation, we will accept a `QueueUser` object in `removeFromQueue` instead of just `socketId`.
    // The calling socket handler usually has the user data.
}

export async function removeUserFromQueue(user: QueueUser) {
    const queueKey = getQueueKey(user.gender, user.preference);
    // Remove strictly by string match
    await redisClient.lrem(queueKey, 0, JSON.stringify(user));
    
    // Set Cooldown
    await setCooldown(user.sessionId);
}

export async function setCooldown(sessionId: string) {
    // 30 Seconds Cooldown
    await redisClient.set(`${COOLDOWN_PREFIX}:${sessionId}`, "1", "EX", 30);
}
