/**
 * Per-socket, per-event rate limiting.
 *
 * An authenticated socket could previously emit any event at any rate. The
 * expensive one is join-queue: every emit drives a session read and a queue
 * search, so a single scripted client on a single connection could saturate the
 * server while spending one frame per request.
 *
 * State is per socket and lives in the socket's own memory, so this costs no
 * Redis commands and dies with the connection.
 */

export interface EventBudget {
    limit: number;
    windowMs: number;
}

/**
 * Deliberately asymmetric. Chatting is what the product is for and must never
 * feel throttled; joining the queue is the costly path and a human does it a
 * handful of times a minute at most.
 */
export const EVENT_BUDGETS: Record<string, EventBudget> = {
    "join-queue": { limit: 6, windowMs: 60_000 },
    "leave-queue": { limit: 12, windowMs: 60_000 },
    "next-match": { limit: 12, windowMs: 60_000 },
    "leave-chat": { limit: 12, windowMs: 60_000 },
    "join-room": { limit: 12, windowMs: 60_000 },
    "exchange-key": { limit: 8, windowMs: 60_000 },
    "send-message": { limit: 30, windowMs: 10_000 },
    typing: { limit: 20, windowMs: 10_000 },
    "report-user": { limit: 3, windowMs: 24 * 60 * 60 * 1000 }
};

/** Refusals tolerated before the caller should drop the connection. */
export const MAX_VIOLATIONS = 20;

export class EventRateLimiter {
    private hits = new Map<string, number[]>();
    private violationCount = 0;

    constructor(private now: () => number = Date.now) {}

    get violations(): number {
        return this.violationCount;
    }

    /** True if the event may proceed. Records the attempt either way. */
    allow(event: string): boolean {
        const budget = EVENT_BUDGETS[event];
        if (!budget) return true;

        const now = this.now();
        const cutoff = now - budget.windowMs;

        const recent = (this.hits.get(event) ?? []).filter((at) => at > cutoff);

        if (recent.length >= budget.limit) {
            this.hits.set(event, recent);
            this.violationCount++;
            return false;
        }

        recent.push(now);
        this.hits.set(event, recent);
        return true;
    }
}
