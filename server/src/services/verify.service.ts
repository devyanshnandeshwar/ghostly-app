import { verifyGender } from "../ai-bridge/client";
import { UserSession } from "../models/UserSession";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { invalidateSessionCache } from "./session.service";
import crypto from "crypto";

export class LowConfidenceError extends Error {
    constructor(public confidence: number) {
        super("Could not determine gender confidently. Please retake the photo.");
        this.name = "LowConfidenceError";
    }
}

export const performVerification = async (imageBuffer: Buffer, session: any) => {
    // Call AI service
    const result = await verifyGender(imageBuffer);

    const confidence = Number(result.confidence);

    // A low-confidence guess must not grant verified status.
    if (!result.gender || !Number.isFinite(confidence) || confidence < config.MIN_VERIFY_CONFIDENCE) {
        logger.warn(
            `Verification rejected for session ${session._id}: confidence ${confidence} < ${config.MIN_VERIFY_CONFIDENCE}`
        );
        throw new LowConfidenceError(confidence);
    }

    // Generate secure hash for the user
    const userHash = crypto
        .createHash("sha256")
        .update(session.deviceId + Date.now().toString()) // unique hash
        .digest("hex");

    await UserSession.findByIdAndUpdate(session._id, {
        isVerified: true,
        gender: result.gender,
        userHash: userHash
    });

    // isVerified and gender gate the matchmaking queue, so the cached view
    // must not survive verification.
    await invalidateSessionCache(session._id.toString());

    return {
        gender: result.gender,
        confidence,
        userHash
    };
};
