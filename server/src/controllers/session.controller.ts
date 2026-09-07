import { Request, Response, NextFunction } from "express";
import { createSession, getSessionByDeviceId, touchLastActive, revokeSession } from "../services/session.service";
import { issueSessionToken, verifySessionToken } from "../utils/token";
import { getFilterUsage } from "../services/quota.service";

export const init = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { token } = req.body;

        // Resume an existing session only when the caller presents a token we
        // signed. Anything else starts a fresh session.
        let session = null;
        let issuedToken: string | null = null;

        if (typeof token === "string") {
            const payload = verifySessionToken(token);
            if (payload) {
                session = await getSessionByDeviceId(payload.deviceId);
                // A token whose version no longer matches has been revoked;
                // treat it as absent so the caller gets a fresh session rather
                // than silently resuming a revoked one.
                if (session && (session.tokenVersion ?? 0) !== payload.version) {
                    session = null;
                }
                if (session) {
                    issuedToken = token;
                    // Keep the TTL index from expiring a session that is in use.
                    await touchLastActive(session._id.toString());
                }
            }
        }

        if (!session) {
            session = await createSession();
            issuedToken = issueSessionToken(session.deviceId, {
                version: session.tokenVersion ?? 0
            });
        }

        // The enforced allowance, read from Redis. The client used to derive this
        // from dailyFilterUsage below, which is a lifetime counter that never
        // resets -- so the filter UI locked permanently after five filtered
        // matches ever.
        const filters = await getFilterUsage(session._id.toString());

        res.json({
            token: issuedToken,
            // The whole allowance, not just what is spent: the client renders
            // these numbers and must not carry its own copy of the limit.
            filtersUsedToday: filters.used,
            filtersRemaining: filters.remaining,
            filtersTotal: filters.total,
            filtersResetInSeconds: filters.resetInSeconds,
            _id: session._id,
            isVerified: session.isVerified,
            gender: session.gender,
            preference: session.preference,
            nickname: session.nickname,
            bio: session.bio,
            userHash: session.userHash,
            lastActive: session.lastActive,
            // Lifetime total, for analytics. Not the quota -- see filtersUsedToday.
            dailyFilterUsage: session.dailyFilterUsage,
            lastFilterUsageDate: session.lastFilterUsageDate,
            reportsAgainst: session.reportsAgainst
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Signs the caller out everywhere by bumping their token version, so a
 * credential that leaked from a shared machine can be killed without rotating
 * the signing secret for every user.
 */
export const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = (req as any).session;
        await revokeSession(session._id);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
};
