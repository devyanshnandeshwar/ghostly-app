import { AuditLog } from "../models/AuditLog";
import { logger } from "../utils/logger";

export type AuditAction =
    | "report.resolve"
    | "session.limit"
    | "session.ban"
    | "session.reinstate";

/**
 * Records a moderator action.
 *
 * Deliberately best-effort: a failure to write the audit row must not roll back
 * the moderation it describes, because leaving an abusive account active
 * because a log write failed is the worse outcome. The failure is logged loudly
 * so the gap is visible.
 */
export async function recordAction(
    actor: string,
    action: AuditAction,
    target: string,
    note?: string
): Promise<void> {
    try {
        await AuditLog.create({ actor, action, target, note });
    } catch (error: any) {
        logger.error(`[Audit] FAILED to record ${action} on ${target}: ${error.message}`);
    }
}
