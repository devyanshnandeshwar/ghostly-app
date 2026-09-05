import { FREE_FILTERS_PER_DAY, FILTER_WINDOW_SECONDS } from "@shared/constants";
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
export async function getFilterUsage(
    sessionId: string
): Promise<{ used: number; resetInSeconds: number }> {
    const key = usageKey(sessionId);

    try {
        const [raw, ttl] = await Promise.all([redisClient.get(key), redisClient.ttl(key)]);

        const used = raw ? parseInt(raw, 10) : 0;

        return {
            used: Number.isFinite(used) ? used : 0,
            // ttl returns -2 for a missing key and -1 for one with no expiry.
            resetInSeconds: ttl > 0 ? ttl : 0
        };
    } catch (error: any) {
        // Never block matchmaking on a quota read. Reporting zero use is the
        // generous failure, which is the right one for a free allowance.
        logger.warn(`Filter usage read failed: ${error.message}`);
        return { used: 0, resetInSeconds: 0 };
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

    const count = await redisClient.incr(key);

    if (count === 1) {
        await redisClient.expire(key, FILTER_WINDOW_SECONDS);
    }
}
