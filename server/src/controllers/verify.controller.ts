import { Request, Response, NextFunction } from "express";
import { performVerification } from "../services/verify.service";

export const verifyIdentity = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Image required" });
        }

        const imageBuffer = req.file.buffer;
        const session = (req as any).session;

        const result = await performVerification(imageBuffer, session);

        // IMPORTANT: Explicitly clear image buffer from memory
        if (req.file) {
            (req.file as any).buffer = null; 
            req.file = undefined;
        }

        res.json({
            verified: true,
            gender: result.gender,
            confidence: result.confidence,
            userHash: result.userHash
        });

    } catch (error) {
        next(error);
    }
};
