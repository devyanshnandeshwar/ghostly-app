import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { config } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Guards admin-only routes with a shared secret.
 *
 * Deliberately separate from verifySession: a device session is a
 * client-supplied identifier, so it must never be able to grant admin access.
 */
export function requireAdmin(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const expected = config.ADMIN_TOKEN;

    // Fail closed: an unconfigured token means admin routes are unreachable,
    // never open.
    if (!expected) {
        logger.error("Admin route blocked: ADMIN_TOKEN is not configured");
        return res.status(503).json({
            error: "Admin API unavailable"
        });
    }

    const header = req.get("authorization") || "";
    const provided = header.startsWith("Bearer ")
        ? header.slice("Bearer ".length)
        : "";

    if (!provided || !timingSafeEqual(provided, expected)) {
        logger.warn(`Unauthorized admin request from ${req.ip} to ${req.originalUrl}`);
        return res.status(401).json({
            error: "Unauthorized"
        });
    }

    next();
}

function timingSafeEqual(a: string, b: string): boolean {
    // Hash first so both buffers are the same length regardless of input,
    // otherwise crypto.timingSafeEqual throws and leaks length via the error.
    const ha = crypto.createHash("sha256").update(a).digest();
    const hb = crypto.createHash("sha256").update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
}
