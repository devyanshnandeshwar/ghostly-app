import { Request, Response, NextFunction } from "express";
import {
    performVerification,
    LowConfidenceError,
    InvalidVerificationError
} from "../services/verify.service";

export const verifyIdentity = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // The image is classified in the browser and never uploaded; only the
        // resulting claim arrives here.
        const { gender, confidence } = req.body ?? {};
        const session = (req as any).session;

        const result = await performVerification(gender, confidence, session);

        res.json({
            verified: true,
            gender: result.gender,
            confidence: result.confidence,
            userHash: result.userHash
        });
    } catch (error) {
        if (error instanceof InvalidVerificationError) {
            return res.status(400).json({ error: error.message });
        }

        if (error instanceof LowConfidenceError) {
            return res.status(422).json({ error: error.message });
        }

        next(error);
    }
};
