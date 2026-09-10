import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { buildCorsOrigins, assertUsableClientUrl } from "./cors";
import { assertUsableSessionSecret } from "./sessionSecret";
import { assertUsableDatastoreUrls } from "./datastoreUrls";

// Load .env file
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

const defaultClientUrl = "http://localhost:5173";
const clientUrl = process.env.CLIENT_URL || defaultClientUrl;

const DEV_SESSION_SECRET = "supersecret";

/**
 * Reads a numeric env var, refusing values that are not numbers.
 *
 * The two call sites below used to be bare Number() calls, and both failed
 * silently and dangerously:
 *
 *   MIN_VERIFY_CONFIDENCE=high  ->  NaN, and `score < NaN` is false for every
 *   score, so every verification passed the confidence gate with no error and
 *   no log. The gate was off and nothing said so.
 *
 *   REPORT_RETENTION_DAYS=abc   ->  NaN, so the `> 0` test in models/Report.ts
 *   was false, the TTL index was never declared, and abuse reports accumulated
 *   forever.
 *
 * They also disagreed on operator. `||` rewrote a legitimate 0 to the default;
 * `??` turned an empty string into 0, which for retention means "keep forever".
 * A value that is present but unusable is a configuration error, not a reason
 * to guess.
 */
export function parseNumberEnv(raw: string | undefined, fallback: number, name: string): number {
    if (raw === undefined || raw.trim() === "") return fallback;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${name} must be a number, got ${JSON.stringify(raw)}`);
    }

    return parsed;
}

const nodeEnv = process.env.NODE_ENV || "development";

export const config = {
    PORT: process.env.PORT || 5000,
    MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/ghostly",
    CLIENT_URL: clientUrl,
    // Production allows exactly the configured client origin; the localhost
    // entries are development-only. See cors.ts.
    CORS_ORIGINS: buildCorsOrigins(clientUrl, nodeEnv),
    NODE_ENV: nodeEnv,
    /**
     * Whether error responses may carry a stack trace.
     *
     * Deliberately keyed on the RAW variable being explicitly set, not on
     * NODE_ENV above -- which falls back to "development" when unset. On a PaaS,
     * unset is a common production configuration, so a "not production" test
     * exposes stacks precisely where it must not. Opt in, never opt out.
     */
    EXPOSE_ERROR_DETAILS:
        process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test",
    SESSION_SECRET: process.env.SESSION_SECRET || DEV_SESSION_SECRET,
    // No default: admin routes fail closed when this is unset.
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || "",
    // Minimum model confidence required to mark a session as verified.
    MIN_VERIFY_CONFIDENCE: parseNumberEnv(
        process.env.MIN_VERIFY_CONFIDENCE,
        0.85,
        "MIN_VERIFY_CONFIDENCE"
    ),
    // Abuse reports are kept this long, then expire via a TTL index. Sessions
    // already expire after 30 days, so a report far older than that refers to
    // accounts that no longer exist. Set to 0 to keep reports forever.
    REPORT_RETENTION_DAYS: parseNumberEnv(
        process.env.REPORT_RETENTION_DAYS,
        365,
        "REPORT_RETENTION_DAYS"
    )
};

// Outside production a missing MONGO_URI is ordinary -- the localhost default
// is the point of it. Warn so the developer knows which default they landed on.
// In production this is an assertion instead; see assertUsableDatastoreUrls.
if (config.NODE_ENV !== "production" && !process.env.MONGO_URI) {
    console.warn("[Config] ⚠️  MONGO_URI is not set; using the localhost default.");
}

// SESSION_SECRET signs session tokens. A known or guessable value in production
// would let anyone forge a credential for any session, so refuse to boot. The
// check lives in sessionSecret.ts because it is worth testing on its own -- the
// version that lived here compared against a single literal and missed the
// placeholder .env.example actually ships.
assertUsableSessionSecret(config.SESSION_SECRET, config.NODE_ENV);

// CLIENT_URL decides who may make credentialed cross-origin calls, and it
// defaults to localhost. Unset in production that is a hole, not a default.
assertUsableClientUrl(config.CLIENT_URL, config.NODE_ENV);

// MONGO_URI and REDIS_URL default to localhost too, and used to be the only
// production-critical variables with no guard at all -- a missing one produced
// a warning at most, then failed much later with a message about the default
// rather than about the missing configuration.
assertUsableDatastoreUrls(
    config.MONGO_URI,
    process.env.REDIS_URL ?? "",
    config.NODE_ENV
);
