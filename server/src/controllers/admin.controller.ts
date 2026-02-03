import { Request, Response } from "express";
import { Report } from "../models/Report";
import { logger } from "../utils/logger";

export const getReports = async (req: Request, res: Response) => {
    try {
        const reports = await Report.find({ resolved: false })
            .sort({ timestamp: -1 })
            .limit(50);
            
        res.json(reports);
    } catch (error: any) {
        logger.error(`Fetch reports error: ${error.message}`);
        res.status(500).json({ error: "Failed to fetch reports" });
    }
};
