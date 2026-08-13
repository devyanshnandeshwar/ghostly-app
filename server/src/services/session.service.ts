import crypto from "crypto";
import { UserSession } from "../models/UserSession";
import { logger } from "../utils/logger";
import { redisClient } from "../config/redis";

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

/**
 * Fields the matchmaking path reads. Cached in Redis so joining the queue
 * doesn't cost a Mongo round trip every time, while still picking up profile
 * and verification changes quickly.
 */
export interface QueueSessionView {
    _id: string;
    isVerified: boolean;
    gender: string | null;
    preference: string;
    nickname: string | null;
    bio: string | null;
    pastMatches: string[];
}

const SESSION_CACHE_TTL_SECONDS = 60;

function getSessionCacheKey(sessionId: string): string {
    return `session:view:${sessionId}`;
}

export async function getQueueSessionView(sessionId: string): Promise<QueueSessionView | null> {
    const cacheKey = getSessionCacheKey(sessionId);

    try {
        const cached = await redisClient.get(cacheKey);
        if (cached) return JSON.parse(cached);
    } catch (error: any) {
        logger.warn(`Session cache read failed: ${error.message}`);
    }

    const session = await UserSession.findById(sessionId);
    if (!session) return null;

    const view: QueueSessionView = {
        _id: session._id.toString(),
        isVerified: session.isVerified ?? false,
        gender: session.gender ?? null,
        preference: session.preference ?? "any",
        nickname: session.nickname ?? null,
        bio: session.bio ?? null,
        pastMatches: session.pastMatches || []
    };

    try {
        await redisClient.setEx(cacheKey, SESSION_CACHE_TTL_SECONDS, JSON.stringify(view));
    } catch (error: any) {
        logger.warn(`Session cache write failed: ${error.message}`);
    }

    return view;
}

/** Call whenever the cached fields change, so the next read is fresh. */
export async function invalidateSessionCache(sessionId: string) {
    try {
        await redisClient.del(getSessionCacheKey(sessionId));
    } catch (error: any) {
        logger.warn(`Session cache invalidation failed: ${error.message}`);
    }
}

/**
 * The TTL index on lastActive expires sessions 30 days after that timestamp,
 * but nothing ever wrote it, so every session died 30 days after creation no
 * matter how active the user was. Throttled to one write per hour per session.
 */
const LAST_ACTIVE_THROTTLE_SECONDS = 60 * 60;

export async function touchLastActive(sessionId: string) {
    const throttleKey = `session:touched:${sessionId}`;

    try {
        // NX: only the first caller in the window wins, so we write to Mongo
        // at most once an hour per session.
        const acquired = await redisClient.set(throttleKey, "1", {
            NX: true,
            EX: LAST_ACTIVE_THROTTLE_SECONDS
        });
        if (!acquired) return;
    } catch (error: any) {
        logger.warn(`lastActive throttle failed: ${error.message}`);
        return;
    }

    await UserSession.findByIdAndUpdate(sessionId, { lastActive: new Date() });
}

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
