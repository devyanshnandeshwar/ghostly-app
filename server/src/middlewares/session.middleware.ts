import { Request, Response, NextFunction } from "express";
import { UserSession } from "../models/UserSession";
import { logger } from "../utils/logger";
import { parseBearer, verifySessionToken } from "../utils/token";

export async function verifySession(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const token = parseBearer(req.get("authorization"));

        if (!token) {
            return res.status(401).json({
                error: "Session token missing"
            });
        }

        const payload = verifySessionToken(token);

        if (!payload) {
            return res.status(401).json({
                error: "Invalid session"
            });
        }

        const session = await UserSession.findOne({ deviceId: payload.deviceId });

        if (!session) {
            return res.status(401).json({
                error: "Invalid session"
            });
        }

        // A bumped tokenVersion revokes this session's outstanding credentials
        // without touching anyone else's.
        if ((session.tokenVersion ?? 0) !== payload.version) {
            return res.status(401).json({
                error: "Session expired"
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
