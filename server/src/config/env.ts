import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load .env file
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

const defaultClientUrl = "http://localhost:5173";
const clientUrl = process.env.CLIENT_URL || defaultClientUrl;

const INSECURE_SESSION_SECRET = "supersecret";

// Allow production URL + localhost so both EC2 and local Docker/dev work
export const config = {
    PORT: process.env.PORT || 5000,
    MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/ghostly",
    CLIENT_URL: clientUrl,
    CORS_ORIGINS: [clientUrl, "http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"].filter(
        (origin, i, arr) => arr.indexOf(origin) === i
    ),
    NODE_ENV: process.env.NODE_ENV || "development",
    SESSION_SECRET: process.env.SESSION_SECRET || INSECURE_SESSION_SECRET,
    // No default: admin routes fail closed when this is unset.
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || "",
    // Minimum model confidence required to mark a session as verified.
    MIN_VERIFY_CONFIDENCE: Number(process.env.MIN_VERIFY_CONFIDENCE || 0.85),
    // Abuse reports are kept this long, then expire via a TTL index. Sessions
    // already expire after 30 days, so a report far older than that refers to
    // accounts that no longer exist. Set to 0 to keep reports forever.
    REPORT_RETENTION_DAYS: Number(process.env.REPORT_RETENTION_DAYS ?? 365)
};

// Validate essential env vars
const requiredVars = ["MONGO_URI"];
const missingVars = requiredVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
    console.warn(`[Config] ⚠️  Missing required environment variables: ${missingVars.join(", ")}`);
}

// SESSION_SECRET signs session tokens. A known default in production would let
// anyone forge a credential for any session, so refuse to boot.
if (config.NODE_ENV === "production" && config.SESSION_SECRET === INSECURE_SESSION_SECRET) {
    throw new Error(
        "[Config] SESSION_SECRET must be set to a strong random value in production"
    );
}
