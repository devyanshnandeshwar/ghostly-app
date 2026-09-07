import { describe, expect, test } from "bun:test";
import {
    statusForReportCount,
    canEnterQueue,
    AUTO_LIMIT_DISTINCT_REPORTERS,
    type AccountStatus
} from "./moderation.policy";

// Reporting was a placebo: the counters the UI reads were never written, no
// endpoint could mark a report resolved, and there was no ban, limit or block
// of any kind. A reported user was matched with someone new by the very next
// join-queue. These pin the policy that replaces that.

describe("statusForReportCount", () => {
    test("leaves an account alone below the threshold", () => {
        expect(statusForReportCount(0)).toBe("active");
        expect(statusForReportCount(AUTO_LIMIT_DISTINCT_REPORTERS - 1)).toBe("active");
    });

    test("limits an account once enough distinct people report it", () => {
        expect(statusForReportCount(AUTO_LIMIT_DISTINCT_REPORTERS)).toBe("limited");
    });

    test("stays limited rather than escalating on its own", () => {
        // Banning is a human decision. Automation contains the damage between
        // reviews; it does not decide the outcome.
        expect(statusForReportCount(AUTO_LIMIT_DISTINCT_REPORTERS * 10)).toBe("limited");
    });

    test("counts distinct reporters, so one person cannot limit someone alone", () => {
        // Guarded by the caller passing a distinct count, but the threshold
        // itself must be above one or a single griefer becomes a moderator.
        expect(AUTO_LIMIT_DISTINCT_REPORTERS).toBeGreaterThan(1);
    });
});

describe("canEnterQueue", () => {
    test("lets an active account match", () => {
        expect(canEnterQueue("active").allowed).toBe(true);
    });

    test.each<AccountStatus>(["limited", "banned"])("refuses a %s account", (status) => {
        expect(canEnterQueue(status).allowed).toBe(false);
    });

    test("explains the refusal in words a user can act on", () => {
        const limited = canEnterQueue("limited");
        const banned = canEnterQueue("banned");

        expect(limited.reason).toBeTruthy();
        expect(banned.reason).toBeTruthy();
        // The two states are not the same thing and must not read as if they are.
        expect(limited.reason).not.toBe(banned.reason);
    });

    test("treats an unknown status as active rather than locking everyone out", () => {
        // A session written before this field existed has no status. Failing
        // closed here would refuse the entire existing user base.
        expect(canEnterQueue(undefined).allowed).toBe(true);
    });
});
