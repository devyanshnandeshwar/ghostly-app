import { Report, ReportReason } from "../models/Report";
import { logger } from "../utils/logger";
import { updateSession } from "./session.service";
import { statusForReportCount } from "./moderation.policy";

const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REPORTS_PER_WINDOW = 3;

export const createReport = async (
    reporterId: string,
    reportedId: string,
    reason: ReportReason = "Other",
    roomId?: string,
    description?: string
) => {
    if (roomId) {
        const existing = await Report.findOne({ reporterId, reportedId, roomId });
        if (existing) return existing;
    }
    // 1. Abuse limit: at most 3 reports per rolling 24 hours.
    //
    // Rolling, not a calendar day: setHours(0,0,0,0) used the container's local
    // midnight, so the reset landed at an arbitrary hour of the user's day and
    // could be gamed by waiting for the boundary.
    const windowStart = new Date(Date.now() - REPORT_WINDOW_MS);

    const recentCount = await Report.countDocuments({
        reporterId,
        timestamp: { $gte: windowStart }
    });

    if (recentCount >= MAX_REPORTS_PER_WINDOW) {
        throw new Error("Report limit reached. Please try again later.");
    }

    let report;
    try {
        report = await Report.create({
            reporterId,
            reportedId,
            reason,
            roomId,
            description,
            resolved: false
        });
    } catch (error: any) {
        // The unique index is the real duplicate guard; the read above races.
        if (error?.code === 11000) {
            const existing = await Report.findOne({ reporterId, reportedId, roomId });
            if (existing) return existing;
        }
        throw error;
    }

    // These counters are declared on the schema and read by the client, and
    // were previously written by nothing at all -- the report badge was
    // permanently zero and a report had no consequence of any kind.
    const counterUpdates = await Promise.allSettled([
        updateSession(reporterId, { $inc: { totalReports: 1 } }),
        updateSession(reportedId, { $inc: { reportsAgainst: 1 } })
    ]);
    for (const result of counterUpdates) {
        if (result.status === "rejected") logger.error(`[Report] Counter update failed for ${report._id}: ${result.reason}`);
    }

    // Distinct reporters, not raw count: one person filing repeatedly must not
    // be able to limit someone on their own.
    // The report is durable; ancillary failures must not turn receipt into rejection.
    try {
        const distinctReporters = await Report.distinct("reporterId", {
            reportedId,
            timestamp: { $gte: new Date(Date.now() - REPORT_WINDOW_MS) }
        });
        const status = statusForReportCount(distinctReporters.length);
        if (status !== "active") {
            await updateSession(reportedId, { status });
            logger.warn(`[Moderation] ${reportedId} auto-${status} after ${distinctReporters.length} distinct reporters`);
        }
    } catch (error) {
        logger.error(`[Report] Moderation update failed for ${report._id}: ${error}`);
    }

    logger.info(`[Report] filed against ${reportedId}, reason: ${reason}`);
    return report;
};
