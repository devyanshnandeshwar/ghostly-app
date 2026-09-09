import { FREE_FILTERS_PER_DAY, FILTER_WINDOW_SECONDS } from "../config/limits";
import { redisClient } from "../config/redis";
import { logger } from "../utils/logger";

/**
 * The gender-filter allowance.
 *
 * Deliberately its own module rather than part of session.service: this state
 * lives entirely in Redis and has nothing to do with the Mongo document. Keeping
 * it separate is also what makes it testable -- session.service imports the
 * mongoose model, which drags the whole driver into any test that touches it.
 *
 * Note the split from UserSession.dailyFilterUsage, which is a LIFETIME counter
 * incremented on every filtered match and never reset. The client used to render
 * that as the daily quota, so five filtered matches ever left the feature
 * permanently greyed out. This module is the only authority on the allowance;
 * dailyFilterUsage is analytics.
 */

function usageKey(sessionId: string): string {
    return `daily_usage:${sessionId}`;
}

/** How many filtered matches this session has left. */
export function filtersRemaining(used: number): number {
    return Math.max(0, FREE_FILTERS_PER_DAY - used);
}

/**
 * What the client needs to render the allowance: how much is spent, and how
 * long until it comes back. resetInSeconds is 0 when no window is open.
 */
export interface FilterUsage {
    used: number;
    remaining: number;
    /** Sent to the client so it never needs its own copy of the allowance. */
    total: number;
    resetInSeconds: number;
}

export async function getFilterUsage(sessionId: string): Promise<FilterUsage> {
    const key = usageKey(sessionId);

    try {
        const [raw, ttl] = await Promise.all([redisClient.get(key), redisClient.ttl(key)]);

        const used = raw ? parseInt(raw, 10) : 0;

        const safeUsed = Number.isFinite(used) ? used : 0;

        return {
            used: safeUsed,
            remaining: filtersRemaining(safeUsed),
            total: FREE_FILTERS_PER_DAY,
            // ttl returns -2 for a missing key and -1 for one with no expiry.
            resetInSeconds: ttl > 0 ? ttl : 0
        };
    } catch (error: any) {
        // Never block matchmaking on a quota read. Reporting zero use is the
        // generous failure, which is the right one for a free allowance.
        logger.warn(`Filter usage read failed: ${error.message}`);
        return {
            used: 0,
            remaining: FREE_FILTERS_PER_DAY,
            total: FREE_FILTERS_PER_DAY,
            resetInSeconds: 0
        };
    }
}

export async function hasFilterQuota(sessionId: string): Promise<boolean> {
    const { used } = await getFilterUsage(sessionId);
    return used < FREE_FILTERS_PER_DAY;
}

/**
 * Records one filtered match. The window runs from the first use, not the most
 * recent, so a steady drip of matches cannot hold the window open forever.
 */
export async function consumeFilter(sessionId: string): Promise<void> {
    const key = usageKey(sessionId);

    try {
        // Create the key WITH its expiry, then increment. The previous order --
        // INCR, then EXPIRE only when the count came back as 1 -- left a window
        // in which the key existed with no TTL at all. Lose that EXPIRE (a
        // dropped connection, a process restart, an Upstash hiccup) and the key
        // never expires; once it reaches the allowance, hasFilterQuota is false
        // forever and nothing in the codebase resets it. getFilterUsage then
        // maps ttl === -1 to resetInSeconds: 0, so the UI cheerfully reports
        // "0s until reset" for the rest of the account's life.
        //
        // socketManager's connect limiter already documents this exact failure
        // and re-applies its TTL on every increment. That trick would turn this
        // fixed window into a sliding one, so quota seeds the key instead.
        // NX means a window already running is left alone.
        const created = await redisClient.set(key, "0", {
            NX: true,
            EX: FILTER_WINDOW_SECONDS
        });

        await redisClient.incr(key);

        if (!created) {
            // A key we did not just create might be one the old implementation
            // stranded. Repair it rather than leave the session locked out.
            const ttl = await redisClient.ttl(key);
            if (ttl === -1) {
                await redisClient.expire(key, FILTER_WINDOW_SECONDS);
            }
        }
    } catch (error: any) {
        // Never fail a match that has already been announced. By the time this
        // runs, both clients have been sent "matched" and joined to the room;
        // throwing here unwound to the join-queue catch, which emitted
        // queue-error to the joiner alone -- so one side returned to idle while
        // the other sat in a chat with a partner who had silently left, and no
        // partner-left was ever sent. An unmetered filter is the cheaper
        // failure, and matches the generous degradation getFilterUsage above
        // already documents.
        logger.warn(`Filter consume failed: ${error.message}`);
    }
}
