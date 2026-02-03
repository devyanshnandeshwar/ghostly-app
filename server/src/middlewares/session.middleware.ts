import { Request, Response, NextFunction } from "express";
import { UserSession } from "../models/UserSession";
import { logger } from "../utils/logger";

export async function verifySession(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const deviceId = req.get("x-device-id");

        if (!deviceId) {
            return res.status(401).json({
                error: "Device ID missing"
            });
        }

        const session = await UserSession.findOne({ deviceId });

        if (!session) {
            return res.status(401).json({
                error: "Invalid session"
            });
        }

        // Attach session to request
        (req as any).session = session;

        next();

    } catch (error: any) {
        logger.error(`Session validation failed: ${error.message}`);
        res.status(500).json({
            error: "Session validation failed"
        });
    }
}
