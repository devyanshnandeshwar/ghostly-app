import { Request, Response } from "express";
import { logger } from "../utils/logger";

export const getReportStats = async (req: Request, res: Response) => {
    try {
        // Session is resolved from the signed token by verifySession.
        const session = (req as any).session;

        res.json({
            totalReports: session.totalReports || 0,
            userReportsAgainstYou: session.reportsAgainst || 0
        });

    } catch (error: any) {
        logger.error(`Get Report Stats Error: ${error.message}`);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
