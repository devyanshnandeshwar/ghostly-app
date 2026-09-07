import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { parseBearer, verifySessionToken } from "../utils/token";
import { getAuthSession } from "../services/session.service";

/**
 * Authenticates a request from its signed session token.
 *
 * Reads through a short-lived cache rather than hitting Mongo on every call.
 * The database previously sat synchronously in front of every authenticated
 * request and every socket handshake, so it was both the throughput ceiling and
 * the availability floor: slow Mongo meant a slow product, and unreachable
 * Mongo meant nobody could connect at all.
 *
 * The attached session carries only what authorisation needs. Handlers wanting
 * more read it themselves, which keeps the hot path small.
 */
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

        const session = await getAuthSession(payload.deviceId);

        if (!session) {
            return res.status(401).json({
                error: "Invalid session"
            });
        }

        // A bumped tokenVersion revokes this session's outstanding credentials
        // without touching anyone else's.
        if (session.tokenVersion !== payload.version) {
            return res.status(401).json({
                error: "Session expired"
            });
        }

        (req as any).session = session;

        next();

    } catch (error: any) {
        logger.error(`Session validation failed: ${error.message}`);
        res.status(500).json({
            error: "Session validation failed"
        });
    }
}
