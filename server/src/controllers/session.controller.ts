import { Request, Response, NextFunction } from "express";
import { initSession } from "../services/session.service";

export const init = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { deviceId } = req.body;

        if (!deviceId) {
            return res.status(400).json({ error: "Device ID required" });
        }

        const session = await initSession(deviceId);

        res.json({
            _id: session._id,
            deviceId: session.deviceId,
            isVerified: session.isVerified,
            gender: session.gender,
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
