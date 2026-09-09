import { Request, Response, NextFunction } from "express";
import { updateProfile } from "../services/profile.service";
import { invalidateSessionCache } from "../services/session.service";

export const update = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = (req as any).session;
        // body-parser 2.x leaves req.body undefined for a request with no body
        // rather than defaulting to {}, and destructuring that answered 500.
        const result = await updateProfile(session._id, req.body ?? {});

        // Preference and nickname are cached on the matchmaking path.
        await invalidateSessionCache(session._id.toString());

        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};
