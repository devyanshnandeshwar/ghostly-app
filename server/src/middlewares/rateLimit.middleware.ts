import rateLimit from "express-rate-limit";
import { parseBearer, verifySessionToken } from "../utils/token";

// Key on the session we actually verified, so the limit can't be reset by
// inventing a new identifier. Unauthenticated requests fall back to IP.
const keyGenerator = (req: any) => {
    const token = parseBearer(req.get?.("authorization"));

    if (token) {
        const payload = verifySessionToken(token);
        if (payload) return payload.deviceId;
    }

    return req.ip || "unknown";
};

export const verifyLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 requests per minute
    keyGenerator: keyGenerator,
    message: { error: "Too many verification attempts. Please wait." },
    validate: false
});

export const sessionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // 100 requests per hour
    keyGenerator: keyGenerator,
    message: { error: "Too many session init attempts. Please wait." },
    validate: false
});

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    keyGenerator: keyGenerator,
    message: { error: "Too many requests. Please wait." },
    validate: false
});
