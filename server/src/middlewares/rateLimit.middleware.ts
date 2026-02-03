import rateLimit from "express-rate-limit";

// Key generator using Device ID header or body
const keyGenerator = (req: any) => {
    return req.headers["x-device-id"] || req.body.deviceId || req.ip || "unknown";
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
