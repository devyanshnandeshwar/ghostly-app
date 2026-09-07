import { Request, Response } from "express";
import { UserSession } from "../models/UserSession";
import { logger } from "../utils/logger";

/**
 * Report counts for the calling session.
 *
 * Reads the document directly rather than off the authenticated session: the
 * auth path now attaches only what authorisation needs, and these counters are
 * not on that hot path.
 */
export const getReportStats = async (req: Request, res: Response) => {
    try {
        const session = (req as any).session;

        const doc = await UserSession.findById(session._id)
            .select("totalReports reportsAgainst")
            .lean();

        res.json({
            totalReports: (doc as any)?.totalReports || 0,
            userReportsAgainstYou: (doc as any)?.reportsAgainst || 0
        });

    } catch (error: any) {
        logger.error(`Get Report Stats Error: ${error.message}`);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
