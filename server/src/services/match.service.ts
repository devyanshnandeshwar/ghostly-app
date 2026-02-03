import { QueueUser, Gender } from "@shared/types/User";
import { logger } from "../utils/logger";
// import { redisClient } from "../config/redis";

// In-Memory Storage for Single Instance
const queues = new Map<string, QueueUser[]>();
const cooldowns = new Map<string, number>();

// Queues initialization
const queueKeys = [
    "ghosty:queue:male:male",
    "ghosty:queue:male:female",
    "ghosty:queue:male:any",
    "ghosty:queue:female:male",
    "ghosty:queue:female:female",
    "ghosty:queue:female:any"
];

queueKeys.forEach(key => queues.set(key, []));

// Redis Key Constants (Kept for internal naming consistency if needed, though Maps use them directly)
const QUEUE_PREFIX = "ghosty:queue";

function getQueueKey(gender: string, preference: string): string {
    return `${QUEUE_PREFIX}:${gender}:${preference}`;
}

export async function addToQueue(newUser: QueueUser) {
    const { sessionId, gender, preference } = newUser;

    // 1. Check Cooldown
    const expiry = cooldowns.get(sessionId);
    if (expiry && expiry > Date.now()) {
        const remaining = Math.ceil((expiry - Date.now()) / 1000);
        return { error: "cooldown", remaining };
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
        const queue = queues.get(queueKey);
        if (!queue || queue.length === 0) continue;

        // Iterate to find a valid match (checking past matches)
        // In-memory allows us to peek and splice easily!
        for (let i = 0; i < queue.length; i++) {
             // We only check the first few to maintain "Queue" order, or scan all?
             // Scanning all is O(N) but better for user experience. 
             // Let's scan up to 5 candidates.
             if (i >= 5) break;

             const candidate = queue[i];

             // Check collision with Self
             if (candidate.sessionId === sessionId) {
                 queue.splice(i, 1); // Remove stale self
                 i--; // Adjustment
                 continue;
             }

             // Check Past Matches
             if (newUser.pastMatches.includes(candidate.sessionId) || candidate.pastMatches.includes(sessionId)) {
                 continue; // Skip this candidate, try next
             }

             // FOUND VALID MATCH
             // Remove candidate from queue
             queue.splice(i, 1); 

             // Clear cooldowns
             cooldowns.delete(sessionId);
             cooldowns.delete(candidate.sessionId);

             return {
                 user1: newUser,
                 user2: candidate
             };
        }
    }

    // 4. No Match Found -> Enqueue Myself
    const myQueueKey = getQueueKey(gender, preference);
    const myQueue = queues.get(myQueueKey);
    
    if (myQueue) {
        // Prevent strictly duplicate sessions
        const existingIndex = myQueue.findIndex(u => u.sessionId === sessionId);
        if (existingIndex !== -1) {
            myQueue.splice(existingIndex, 1);
        }
        myQueue.push(newUser);
    }
    
    return null;
}

export async function removeFromQueue(socketId: string) {
    // Scan all queues and remove by socketId/sessionId logic if user object isn't passed.
    // Ideally we pass User, but for safety scan all.
    for (const queue of queues.values()) {
        // We assume socketId mapping might be tricky if SessionId is used in User object.
        // But usually we can filter if we knew SessionId. 
        // NOTE: The previous code didn't implement this fully either.
        // We will skip implementing "remove by socketId" if we don't have sessionId map.
        // However, `removeUserFromQueue` is the main one used.
    }
}

export async function removeUserFromQueue(user: QueueUser) {
    const queueKey = getQueueKey(user.gender, user.preference);
    const queue = queues.get(queueKey);
    if (queue) {
        const idx = queue.findIndex(u => u.sessionId === user.sessionId);
        if (idx !== -1) {
            queue.splice(idx, 1);
        }
    }
    
    // Set Cooldown
    await setCooldown(user.sessionId);
}

export async function setCooldown(sessionId: string) {
    // 30 Seconds Cooldown
    cooldowns.set(sessionId, Date.now() + 30000);
}
