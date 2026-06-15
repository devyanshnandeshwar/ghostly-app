import { UserSession } from "../models/UserSession";
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

import { redisClient } from "../config/redis";

function getDailyUsageKey(sessionId: string): string {
    return `daily_usage:${sessionId}`;
}

function getSecondsUntilEndOfDay(): number {
    const now = new Date();
    const eod = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return Math.floor((eod.getTime() - now.getTime()) / 1000);
}

export async function checkDailyLimit(sessionId: string): Promise<boolean> {
    const key = getDailyUsageKey(sessionId);
    const count = await redisClient.get(key);

    if (count && parseInt(count, 10) >= 5) {
        return false;
    }
    return true;
}

export async function incrementDailyUsage(sessionId: string) {
    const key = getDailyUsageKey(sessionId);
    const result = await redisClient.incr(key);
    
    // Set expiry if it's the first increment
    if (result === 1) {
        await redisClient.expire(key, getSecondsUntilEndOfDay());
    }
}
