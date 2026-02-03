import { UserSession } from "../models/UserSession";
import { redisClient } from "../config/redis";
import { logger } from "../utils/logger";

export const initSession = async (deviceId: string) => {
    const session = await UserSession.findOneAndUpdate(
        { deviceId },
        {
            $setOnInsert: {
                deviceId,
                isVerified: false,
                gender: null
            }
        },
        {
            new: true,
            upsert: true
        }
    );
    return session;
};

// Redis-based Daily Limit Logic
// Key: ghosty:usage:{sessionId}:{YYYY-MM-DD}
// TTL: 24 Hours + Buffer

function getDailyKey(sessionId: string): string {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `ghosty:usage:${sessionId}:${today}`;
}

export async function checkDailyLimit(sessionId: string): Promise<boolean> {
    const key = getDailyKey(sessionId);
    const count = await redisClient.get(key);
    
    // Limit is 5 free matches
    if (count && parseInt(count) >= 5) {
        return false;
    }
    return true;
}

export async function incrementDailyUsage(sessionId: string) {
    const key = getDailyKey(sessionId);
    const multi = redisClient.multi();
    
    multi.incr(key);
    multi.expire(key, 24 * 60 * 60 + 3600); // 25 Hours to be safe
    
    await multi.exec();
}
