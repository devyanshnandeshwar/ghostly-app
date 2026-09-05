import { describe, expect, test, beforeEach } from "bun:test";
import { EventRateLimiter, EVENT_BUDGETS } from "./eventRateLimit";

// Once a socket was authenticated it could emit anything at any rate. join-queue
// was the expensive one: each emit drove a cached-session read and a queue
// search, so one scripted client on one connection could saturate the server
// while costing the attacker a single frame.

describe("EventRateLimiter", () => {
    let limiter: EventRateLimiter;
    let now: number;

    beforeEach(() => {
        now = 10_000;
        limiter = new EventRateLimiter(() => now);
    });

    test("allows an event with no configured budget", () => {
        expect(limiter.allow("disconnect")).toBe(true);
    });

    test("allows exactly the budget, then refuses", () => {
        const budget = EVENT_BUDGETS["join-queue"];

        for (let i = 0; i < budget.limit; i++) {
            expect(limiter.allow("join-queue")).toBe(true);
        }

        expect(limiter.allow("join-queue")).toBe(false);
    });

    test("refills once the window slides past", () => {
        const budget = EVENT_BUDGETS["join-queue"];
        for (let i = 0; i < budget.limit; i++) limiter.allow("join-queue");
        expect(limiter.allow("join-queue")).toBe(false);

        now += budget.windowMs + 1;

        expect(limiter.allow("join-queue")).toBe(true);
    });

    test("keeps a separate budget per event", () => {
        const budget = EVENT_BUDGETS["join-queue"];
        for (let i = 0; i < budget.limit; i++) limiter.allow("join-queue");

        expect(limiter.allow("join-queue")).toBe(false);
        expect(limiter.allow("send-message")).toBe(true);
    });

    test("counts violations so a persistent abuser can be disconnected", () => {
        const budget = EVENT_BUDGETS["join-queue"];
        for (let i = 0; i < budget.limit; i++) limiter.allow("join-queue");

        limiter.allow("join-queue");
        limiter.allow("join-queue");

        expect(limiter.violations).toBe(2);
    });

    test("budgets messages more generously than queue joins", () => {
        // Chatting is the point of the product; queue joins are the expensive
        // path. A limit that throttles conversation would be worse than none.
        expect(EVENT_BUDGETS["send-message"].limit).toBeGreaterThan(
            EVENT_BUDGETS["join-queue"].limit
        );
    });
});
