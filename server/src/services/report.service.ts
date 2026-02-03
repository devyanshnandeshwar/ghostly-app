import { Report } from "../models/Report";
import { logger } from "../utils/logger";

export const createReport = async (
    reporterId: string,
    reportedId: string,
    reason: string = "Abusive Behavior",
    roomId?: string,
    description?: string
) => {
    // 1. Abuse Limit: Max 3 reports per day
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyCount = await Report.countDocuments({
        reporterId,
        timestamp: { $gte: today }
    });

    if (dailyCount >= 3) {
        throw new Error("Daily report limit reached. Please try again tomorrow.");
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
