import { Report, ReportReason } from "../models/Report";
import { logger } from "../utils/logger";

const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REPORTS_PER_WINDOW = 3;

export const createReport = async (
    reporterId: string,
    reportedId: string,
    reason: ReportReason = "Other",
    roomId?: string,
    description?: string
) => {
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

    // 2. Duplicate Check
    if (roomId) {
        const existing = await Report.findOne({
            reporterId,
            reportedId,
            roomId
        });

        if (existing) {
             throw new Error("You have already reported this user in this session.");
        }
    }

    const report = await Report.create({
        reporterId,
        reportedId,
        reason,
        roomId,
        description,
        resolved: false
    });

    logger.info(`[Report] User ${reporterId} reported ${reportedId}. Reason: ${reason}`);
    return report;
};
