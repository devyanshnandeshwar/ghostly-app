/**
 * What the platform does about abuse reports.
 *
 * Kept separate from persistence deliberately. The previous implementation
 * stored reports and did nothing else: totalReports and reportsAgainst were
 * declared on the schema and read by the client but written by no code path,
 * `resolved` could never be set to true because no endpoint existed to set it,
 * and there was no ban, limit or block anywhere. Filing a report produced a row
 * nobody could act on, and the reported user was matched with someone new by
 * the very next join-queue.
 *
 * These are policy values, not engineering constants. Change them here.
 */

export type AccountStatus = "active" | "limited" | "banned";

/**
 * Distinct reporters within the report window before an account is
 * automatically limited.
 *
 * Above one on purpose: keyed on distinct reporters so that one determined
 * griefer cannot appoint themselves moderator, and low enough that a genuinely
 * abusive user is contained within a single session rather than after review.
 */
export const AUTO_LIMIT_DISTINCT_REPORTERS = 3;

/**
 * The status an account earns from its recent report count.
 *
 * Automation limits; it never bans. A ban ends someone's access to the product
 * and is a human decision -- automating it hands that decision to whoever can
 * organise three accounts.
 */
export function statusForReportCount(distinctReporters: number): AccountStatus {
    return distinctReporters >= AUTO_LIMIT_DISTINCT_REPORTERS ? "limited" : "active";
}

export interface QueueAdmission {
    allowed: boolean;
    reason?: string;
}

/**
 * Whether an account may join matchmaking.
 *
 * An unknown status reads as active: sessions written before this field existed
 * carry none, and failing closed would lock out the entire existing user base
 * to catch nobody.
 */
export function canEnterQueue(status: AccountStatus | undefined | null): QueueAdmission {
    switch (status) {
        case "limited":
            return {
                allowed: false,
                reason: "Your account is paused while we review reports about it."
            };
        case "banned":
            return {
                allowed: false,
                reason: "Your account has been removed for breaking the community rules."
            };
        default:
            return { allowed: true };
    }
}
