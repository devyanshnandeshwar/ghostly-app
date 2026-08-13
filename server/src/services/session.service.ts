import crypto from "crypto";
import { UserSession } from "../models/UserSession";
import { logger } from "../utils/logger";

/**
 * Creates a brand new session with a server-generated identifier.
 *
 * The identifier is never accepted from the client: ownership of a session is
 * proven by the signed token issued alongside it.
 */
export const createSession = async () => {
    const session = await UserSession.create({
        deviceId: crypto.randomUUID(),
        isVerified: false,
        gender: null
    });

    logger.debug(`Created session ${session._id}`);
    return session;
};

export const getSessionByDeviceId = async (deviceId: string) => {
    return UserSession.findOne({ deviceId });
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
