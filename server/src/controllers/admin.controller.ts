import { Request, Response } from "express";
import mongoose from "mongoose";
import { Report } from "../models/Report";
import { AuditLog } from "../models/AuditLog";
import { logger } from "../utils/logger";
import { updateSession } from "../services/session.service";
import { recordAction } from "../services/audit.service";

/** Identifies the acting credential. A shared admin token yields one value for
 *  every operator -- a real limitation, recorded rather than papered over. */
function actorOf(req: Request): string {
    return (req.get("x-admin-actor") || "shared-admin-token").slice(0, 64);
}

/** Express 5 types a route param as string | string[]; these routes take one. */
export function paramId(req: Request): string {
    const raw = req.params.id;
    return Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
}

/**
 * A malformed id is the caller's mistake, not ours.
 *
 * Without this, mongoose threw a CastError on anything that is not an ObjectId
 * and the generic handler answered 500 -- so a typo in an admin URL looked like
 * a server fault and told the operator nothing about what was wrong.
 */
export function isValidId(id: string): boolean {
    return mongoose.isValidObjectId(id);
}

export const getReports = async (req: Request, res: Response) => {
    try {
        // Paginated: the queue will not stay under fifty items, and an
        // unbounded read of user-written text is not something to hand out by
        // accident.
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const skip = Math.max(Number(req.query.skip) || 0, 0);
        const resolved = req.query.resolved === "true";

        const reports = await Report.find({ resolved })
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit);

        res.json({ reports, limit, skip });
    } catch (error: any) {
        logger.error(`Fetch reports error: ${error.message}`);
        res.status(500).json({ error: "Failed to fetch reports" });
    }
};

/**
 * Marks a report handled. `resolved` previously defaulted to false and no code
 * path could ever set it to true, so the moderation queue was append-only and
 * the newest-fifty window would eventually hide everything older.
 */
export const resolveReport = async (req: Request, res: Response) => {
    try {
        const id = paramId(req);
        if (!isValidId(id)) return res.status(400).json({ error: "Invalid report id" });

        const report = await Report.findByIdAndUpdate(id, { resolved: true }, { new: true });

        if (!report) return res.status(404).json({ error: "Report not found" });

        await recordAction(actorOf(req), "report.resolve", id);
        res.json({ success: true, report });
    } catch (error: any) {
        logger.error(`Resolve report error: ${error.message}`);
        res.status(500).json({ error: "Failed to resolve report" });
    }
};

/**
 * Applies a moderation decision to an account. Banning is only ever a human
 * action -- the automatic path in moderation.policy limits and never bans.
 */
export const setSessionStatus = async (req: Request, res: Response) => {
    try {
        const id = paramId(req);
        if (!isValidId(id)) return res.status(400).json({ error: "Invalid session id" });

        const { status, note } = req.body ?? {};

        if (!["active", "limited", "banned"].includes(status)) {
            return res.status(400).json({ error: "status must be active, limited or banned" });
        }

        const updated = await updateSession(id, { status });
        if (!updated) return res.status(404).json({ error: "Session not found" });

        const action =
            status === "banned"
                ? "session.ban"
                : status === "limited"
                  ? "session.limit"
                  : "session.reinstate";

        await recordAction(actorOf(req), action, id, note);
        res.json({ success: true, status });
    } catch (error: any) {
        logger.error(`Set session status error: ${error.message}`);
        res.status(500).json({ error: "Failed to update session" });
    }
};

/** The audit trail itself, so moderator activity is reviewable. */
export const getAuditLog = async (req: Request, res: Response) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 100, 500);
        const entries = await AuditLog.find().sort({ timestamp: -1 }).limit(limit);
        res.json({ entries });
    } catch (error: any) {
        logger.error(`Fetch audit log error: ${error.message}`);
        res.status(500).json({ error: "Failed to fetch audit log" });
    }
};
