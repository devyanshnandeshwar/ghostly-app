/**
 * Product limits the server enforces.
 *
 * These are deliberately NOT shared with the client. The client is told the
 * numbers that apply to it in the session payload, so there is exactly one
 * copy and no way for the two to drift -- which is precisely how the filter
 * quota UI came to contradict the server it was reporting on.
 */

/** Gender-filtered matches allowed per rolling window. */
export const FREE_FILTERS_PER_DAY = 5;

/**
 * How long the filter allowance takes to come back, measured from first use.
 *
 * A rolling window rather than a calendar day: expiring at the container's
 * local midnight reset at an arbitrary hour of the user's day.
 */
export const FILTER_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * How long a session that has never verified is kept.
 *
 * Every unauthenticated POST /api/session/init writes a document that used to
 * live for thirty days. That made storage exhaustion cheap: a script could mint
 * junk sessions far faster than they aged out, and the disk filling stops the
 * whole product. A session someone actually uses is promoted to the normal
 * lifetime the moment it verifies.
 */
export const UNVERIFIED_SESSION_TTL_SECONDS = 6 * 60 * 60;
