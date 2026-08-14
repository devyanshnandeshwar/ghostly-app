import crypto from "crypto";
import { UpdateQuery } from "mongoose";
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

// Exactly the fields mirrored into QueueSessionView above. Keep the two in step:
// a field cached but missing here would go stale, silently.
const CACHED_FIELDS = new Set<keyof QueueSessionView | string>([
    "isVerified",
    "gender",
    "preference",
    "nickname",
    "bio",
    "pastMatches"
]);

/** True if an update writes any field the Redis view mirrors. */
function touchesCachedField(update: UpdateQuery<any>): boolean {
    const hits = (field: string) => CACHED_FIELDS.has(field.split(".")[0]);

    for (const [key, value] of Object.entries(update)) {
        // Operators ($set, $inc, $addToSet, ...) nest the real field names.
        if (key.startsWith("$")) {
            if (value && typeof value === "object" && Object.keys(value).some(hits)) {
                return true;
            }
            continue;
        }

        if (hits(key)) return true;
    }

    return false;
}

/**
 * The one place UserSession documents are updated.
 *
 * Cache invalidation used to be the caller's job, and updateMatchHistory
 * forgot: it wrote pastMatches straight to Mongo, so for up to the cache TTL
 * matchmaking still read the old list and could pair two users who had just
 * been together. Routing writes through here removes the chance to forget --
 * any update touching a cached field clears the view, and updates that touch
 * only uncached fields (lastActive, dailyFilterUsage) skip the Redis call.
 *
 * Invalidation happens after the write so a concurrent read cannot repopulate
 * the old value. A read landing in the gap between the two can still cache a
 * stale view for one TTL; closing that needs versioned entries, which is not
 * worth it for data this short-lived.
 */
export async function updateSession(sessionId: string, update: UpdateQuery<any>) {
    const result = await UserSession.findByIdAndUpdate(sessionId, update, { new: true });

    if (touchesCachedField(update)) {
        await invalidateSessionCache(sessionId);
    }

    return result;
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

    await updateSession(sessionId, { lastActive: new Date() });
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
