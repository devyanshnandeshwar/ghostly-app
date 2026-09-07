import { config } from "../config/env";
import { logger } from "../utils/logger";
import { updateSession } from "./session.service";
import crypto from "crypto";

/**
 * Gender is classified in the browser and sent here as a claim. The server
 * records it; it does not check it. Anyone can POST any allowed value.
 *
 * That is a deliberate design decision, not an oversight -- see the trust model
 * section in DOCUMENTATION.md. The validation below exists to keep the database
 * well-formed, not to establish that the claim is true.
 */

export class LowConfidenceError extends Error {
    constructor(public confidence: number) {
        super("Could not determine gender confidently. Please retake the photo.");
        this.name = "LowConfidenceError";
    }
}

/** The submitted body was malformed. Deterministic: retrying it cannot help. */
export class InvalidVerificationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidVerificationError";
    }
}

const ALLOWED_GENDERS = ["male", "female"] as const;
type AllowedGender = (typeof ALLOWED_GENDERS)[number];

export const performVerification = async (gender: unknown, confidence: unknown, session: any) => {
    // Untrusted input on its way into session.gender, which match.socket.ts reads
    // to pair users. The allowlist is the only thing between the client and that
    // field, so it is checked rather than cast.
    if (typeof gender !== "string" || !ALLOWED_GENDERS.includes(gender as AllowedGender)) {
        throw new InvalidVerificationError("A gender of 'male' or 'female' is required.");
    }

    const score = Number(confidence);

    if (!Number.isFinite(score) || score < 0 || score > 1) {
        throw new InvalidVerificationError("A confidence between 0 and 1 is required.");
    }

    // Advisory only. Classification happens on the device now, so a client can
    // send whatever number it likes and this proves nothing about the claim. It
    // is kept because it costs nothing and still stops an honest client's
    // genuinely uncertain prediction from granting verified status.
    if (score < config.MIN_VERIFY_CONFIDENCE) {
        logger.warn(
            `Verification rejected for session ${session._id}: confidence ${score} < ${config.MIN_VERIFY_CONFIDENCE}`
        );
        throw new LowConfidenceError(score);
    }

    // Generate secure hash for the user
    const userHash = crypto
        .createHash("sha256")
        .update(session.deviceId + Date.now().toString()) // unique hash
        .digest("hex");

    // isVerified and gender gate the matchmaking queue, so the cached view must
    // not survive verification. updateSession clears it as part of the write.
    await updateSession(session._id, {
        isVerified: true,
        gender: gender as AllowedGender,
        userHash: userHash,
        // Promote off the short unverified expiry onto the normal 30-day
        // inactivity rule. MongoDB's TTL skips documents where this is null.
        expiresAt: null
    });

    return {
        gender: gender as AllowedGender,
        confidence: score,
        userHash
    };
};
