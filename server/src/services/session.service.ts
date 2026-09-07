import crypto from "crypto";
import { UpdateQuery } from "mongoose";
import { UserSession } from "../models/UserSession";
import { logger } from "../utils/logger";
import { redisClient } from "../config/redis";
import { UNVERIFIED_SESSION_TTL_SECONDS } from "../config/limits";
import { TtlCache } from "./ttlCache";

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
        gender: null,
        // Junk sessions from an unauthenticated mint must age out in hours, not
        // the thirty days a real one gets. Cleared on verification.
        expiresAt: new Date(Date.now() + UNVERIFIED_SESSION_TTL_SECONDS * 1000)
    });

    logger.debug(`Created session ${session._id}`);
    return session;
};

export const getSessionByDeviceId = async (deviceId: string) => {
    return UserSession.findOne({ deviceId });
};

/**
 * The authentication path's view of a session.
 *
 * Every authenticated HTTP request and every socket handshake did a Mongo
 * findOne, so the database sat synchronously in front of the entire product:
 * when it was slow everything was slow, and when it was down nobody could even
 * connect. The queue path was given a cache for exactly this reason while the
 * far hotter auth path was not.
 *
 * Deliberately carries only identity and tokenVersion. Mutable state like
 * status lives in the queue session view, which updateSession invalidates;
 * caching it here too would create a second copy that nothing invalidates.
 *
 * Short TTL regardless, because tokenVersion is what revocation turns on. Ten
 * seconds bounds how long a revoked token keeps working if the explicit
 * invalidation below is ever missed.
 */
const AUTH_CACHE_TTL_MS = 10_000;

export interface AuthSessionView {
    _id: string;
    deviceId: string;
    tokenVersion: number;
}

const authViews = new TtlCache<AuthSessionView>(AUTH_CACHE_TTL_MS);

export async function getAuthSession(deviceId: string): Promise<AuthSessionView | null> {
    const cached = authViews.get(deviceId);
    if (cached) return cached;

    const session = await UserSession.findOne({ deviceId }).lean();
    if (!session) return null;

    const view: AuthSessionView = {
        _id: String((session as any)._id),
        deviceId: (session as any).deviceId,
        tokenVersion: (session as any).tokenVersion ?? 0
    };

    authViews.set(deviceId, view);
    return view;
}

/** Drop a session's cached auth view, so a revocation takes effect at once. */
export function invalidateAuthCache(deviceId: string) {
    authViews.delete(deviceId);
}

/**
 * Fields the matchmaking path reads. Cached in Redis so joining the queue
 * doesn't cost a Mongo round trip every time, while still picking up profile
 * and verification changes quickly.
 */
export interface QueueSessionView {
    _id: string;
    isVerified: boolean;
    /** Gates matchmaking. Must be cached, or a ban lags by a full cache TTL. */
    status: string;
    /** Whether the age declaration has been made. Also gates matchmaking. */
    ageConfirmed: boolean;
    gender: string | null;
    preference: string;
    nickname: string | null;
    bio: string | null;
    pastMatches: string[];
}

const SESSION_CACHE_TTL_SECONDS = 60;

// In process, not Redis. This is a cache: its only job was to spare a Mongo
// read, and routing it through a network hop to do that on a single instance
// was strictly worse than a map.
const sessionViews = new TtlCache<QueueSessionView>(SESSION_CACHE_TTL_SECONDS * 1000);

export async function getQueueSessionView(sessionId: string): Promise<QueueSessionView | null> {
    const cached = sessionViews.get(sessionId);
    if (cached) return cached;

    const session = await UserSession.findById(sessionId);
    if (!session) return null;

    const view: QueueSessionView = {
        _id: session._id.toString(),
        isVerified: session.isVerified ?? false,
        status: (session as any).status ?? "active",
        ageConfirmed: Boolean((session as any).ageConfirmedAt),
        gender: session.gender ?? null,
        preference: session.preference ?? "any",
        nickname: session.nickname ?? null,
        bio: session.bio ?? null,
        pastMatches: session.pastMatches || []
    };

    sessionViews.set(sessionId, view);

    return view;
}

/** Call whenever the cached fields change, so the next read is fresh. */
export async function invalidateSessionCache(sessionId: string) {
    sessionViews.delete(sessionId);
}

// Exactly the fields mirrored into QueueSessionView above. Keep the two in step:
// a field cached but missing here would go stale, silently.
const CACHED_FIELDS = new Set<keyof QueueSessionView | string>([
    "isVerified",
    "status",
    "ageConfirmedAt",
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

// The gender-filter allowance moved to quota.service.ts. It lives entirely in
// Redis, so keeping it here forced every quota test to import the mongoose
// model above and drag in the whole driver.

/**
 * Invalidates every outstanding token for one session.
 *
 * Bumping the version is what makes revocation possible at all: before this the
 * only lever was rotating SESSION_SECRET, which signs out every user at once.
 */
export async function revokeSession(sessionId: string) {
    const updated = await UserSession.findByIdAndUpdate(
        sessionId,
        { $inc: { tokenVersion: 1 } },
        { new: true }
    );
    await invalidateSessionCache(sessionId);
    // Without this the revoked token keeps working for the auth cache's TTL,
    // which defeats the point of revoking it.
    if (updated?.deviceId) invalidateAuthCache(updated.deviceId);
}
