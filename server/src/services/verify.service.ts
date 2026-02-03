import { verifyGender } from "../ai-bridge/client";
import { UserSession } from "../models/UserSession";
import crypto from "crypto";

export const performVerification = async (imageBuffer: Buffer, session: any) => {
    // Call AI service
    const result = await verifyGender(imageBuffer);

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

    return {
        gender: result.gender,
        confidence: result.confidence,
        userHash
    };
};
