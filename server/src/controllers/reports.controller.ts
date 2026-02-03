import { Request, Response } from "express";
import { UserSession } from "../models/UserSession";
import { logger } from "../utils/logger";

export const getReportStats = async (req: Request, res: Response) => {
    try {
        const deviceId = req.headers["x-device-id"] as string;

        if (!deviceId) {
            res.status(400).json({ error: "Device ID required" });
            return;
        }

        const session = await UserSession.findOne({ deviceId });

        if (!session) {
            res.status(404).json({ error: "Session not found" });
            return;
        }

        res.json({
            totalReports: session.totalReports || 0,
            userReportsAgainstYou: session.reportsAgainst || 0
        });

    } catch (error: any) {
        logger.error(`Get Report Stats Error: ${error.message}`);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
