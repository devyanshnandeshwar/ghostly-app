import { Request, Response, NextFunction } from "express";
import { updateProfile } from "../services/profile.service";

export const update = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = (req as any).session;
        const result = await updateProfile(session._id, req.body);
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};
