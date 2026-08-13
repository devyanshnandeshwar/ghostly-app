import { Request, Response, NextFunction } from "express";
import { performVerification, LowConfidenceError } from "../services/verify.service";

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
        // Clear the buffer on the failure path too, not just on success.
        if (req.file) {
            (req.file as any).buffer = null;
            req.file = undefined;
        }

        if (error instanceof LowConfidenceError) {
            return res.status(422).json({ error: error.message });
        }

        next(error);
    }
};
