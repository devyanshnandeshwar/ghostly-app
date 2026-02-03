import { UserSession } from "../models/UserSession";
// import { redisClient } from "../config/redis";
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

// In-Memory Storage for Single Instance Deployment
// Map<sessionId, { count: number, date: string }>
const dailyUsageMap = new Map<string, { count: number, date: string }>();

function getToday(): string {
    return new Date().toISOString().split('T')[0];
}

export async function checkDailyLimit(sessionId: string): Promise<boolean> {
    const today = getToday();
    const usage = dailyUsageMap.get(sessionId);

    // Reset if date changed
    if (usage && usage.date !== today) {
        usage.count = 0;
        usage.date = today;
        return true; 
    }

    // Limit is 5 free matches
    if (usage && usage.count >= 5) {
        return false;
    }
    return true;
}

export async function incrementDailyUsage(sessionId: string) {
    const today = getToday();
    let usage = dailyUsageMap.get(sessionId);

    if (!usage || usage.date !== today) {
        usage = { count: 0, date: today };
        dailyUsageMap.set(sessionId, usage);
    }

    usage.count++;
}
