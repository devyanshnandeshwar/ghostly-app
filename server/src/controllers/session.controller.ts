import { Request, Response, NextFunction } from "express";
import { createSession, getSessionByDeviceId } from "../services/session.service";
import { issueSessionToken, verifySessionToken } from "../utils/token";

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
                if (session) {
                    issuedToken = token;
                }
            }
        }

        if (!session) {
            session = await createSession();
            issuedToken = issueSessionToken(session.deviceId);
        }

        res.json({
            token: issuedToken,
            _id: session._id,
            isVerified: session.isVerified,
            gender: session.gender,
            preference: session.preference,
            nickname: session.nickname,
            bio: session.bio,
            userHash: session.userHash,
            lastActive: session.lastActive,
            dailyFilterUsage: session.dailyFilterUsage,
            lastFilterUsageDate: session.lastFilterUsageDate,
            reportsAgainst: session.reportsAgainst
        });
    } catch (error) {
        next(error);
    }
};
