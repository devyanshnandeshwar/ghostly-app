import type { UpdateQuery } from "mongoose";

/**
 * Which UserSession fields the cached queue view mirrors, and whether a given
 * update touches any of them.
 *
 * Lives in its own module rather than inside session.service for the same
 * reason buildCorsOrigins and assertUsableSessionSecret do: it is pure, it is
 * the riskiest logic in its area, and reaching it through session.service meant
 * dragging in the mongoose model and the Redis client to test a function that
 * needs neither.
 */

// Exactly the fields mirrored into QueueSessionView. Keep the two in step: a
// field cached but missing here would go stale, silently.
const CACHED_FIELDS = new Set<string>([
    "isVerified",
    "status",
    "ageConfirmedAt",
    "gender",
    "preference",
    "nickname",
    "bio",
    "pastMatches"
]);

/**
 * True if an update writes any field the cached view mirrors.
 *
 * What this protects: a ban that does not invalidate leaves the account
 * matchable for a full cache TTL, and a pastMatches write that does not
 * invalidate pairs two people who have just been together straight back up.
 * Both fail silently, which is why it is worth testing on its own.
 */
export function touchesCachedField(update: UpdateQuery<any>): boolean {
    if (!update || typeof update !== "object") return false;

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
