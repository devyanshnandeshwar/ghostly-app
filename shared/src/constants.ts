/**
 * Values the client and server must agree on.
 *
 * FREE_FILTERS_PER_DAY previously existed three times -- twice in the client
 * and once hardcoded in the server's limit check -- which is how the UI came to
 * render a quota the server did not enforce.
 */

/** Gender-filtered matches allowed per rolling window. */
export const FREE_FILTERS_PER_DAY = 5;

/**
 * How long the filter allowance takes to come back, measured from first use.
 *
 * A rolling window rather than a calendar day: the previous implementation
 * expired at the container's local midnight, so a user in UTC+12 got their
 * reset at lunchtime and one in UTC-8 in the late afternoon.
 */
export const FILTER_WINDOW_SECONDS = 24 * 60 * 60;
