import crypto from "crypto";
import { config } from "../config/env";

/**
 * Stateless session credentials.
 *
 * The deviceId inside a token is generated server-side and the token is signed
 * with SESSION_SECRET, so a client cannot mint a credential for a session it
 * does not own. Never authenticate on a raw client-supplied deviceId.
 *
 * A token used to be valid forever: issuedAt was recorded and never read, and
 * because replaying a token also refreshed lastActive, the session TTL never
 * reached a credential in active use. One exposure -- a shared machine, a
 * browser extension, script execution on a page with no CSP -- was permanent
 * access, and the only remediation was rotating SESSION_SECRET, which logs out
 * every user simultaneously. That is a second outage, not an incident response.
 *
 * Two things fix that. An absolute expiry bounds the damage in time, and a
 * per-session version bounds it to one user: bump UserSession.tokenVersion and
 * that session's outstanding tokens stop verifying while everyone else's keep
 * working.
 */

const TOKEN_VERSION = "v1";

/** How long a credential stays valid regardless of activity. */
export const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Tolerance for a token minted a moment ahead of this machine's clock. Small on
 * purpose: a forged future issuedAt would otherwise extend a token's life.
 */
const CLOCK_SKEW_MS = 60 * 1000;

export interface SessionTokenPayload {
    deviceId: string;
    issuedAt: number;
    /** Matched against UserSession.tokenVersion to allow single-session revocation. */
    version: number;
}

function sign(body: string): string {
    return crypto
        .createHmac("sha256", config.SESSION_SECRET)
        .update(body)
        .digest("base64url");
}

export function issueSessionToken(
    deviceId: string,
    options: { issuedAt?: number; version?: number } = {}
): string {
    const payload: SessionTokenPayload = {
        deviceId,
        issuedAt: options.issuedAt ?? Date.now(),
        version: options.version ?? 0
    };

    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const body = `${TOKEN_VERSION}.${encoded}`;

    return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
    if (typeof token !== "string") return null;

    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [version, encoded, signature] = parts;
    if (version !== TOKEN_VERSION) return null;

    const expected = sign(`${version}.${encoded}`);

    // Compare as fixed-length buffers; timingSafeEqual throws on length mismatch.
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
        if (!payload || typeof payload.deviceId !== "string") return null;
        if (typeof payload.issuedAt !== "number" || !Number.isFinite(payload.issuedAt)) {
            return null;
        }

        const age = Date.now() - payload.issuedAt;
        if (age > TOKEN_MAX_AGE_MS) return null;
        if (age < -CLOCK_SKEW_MS) return null;

        return {
            deviceId: payload.deviceId,
            issuedAt: payload.issuedAt,
            // Absent on tokens minted before versioning existed. Treating those
            // as version 0 keeps them working, and still lets a bump revoke
            // them, so this costs nobody a forced logout.
            version: typeof payload.version === "number" ? payload.version : 0
        };
    } catch {
        return null;
    }
}

/** Extracts a bearer token from an Authorization header, if present. */
export function parseBearer(header: string | undefined): string | null {
    if (!header || !header.startsWith("Bearer ")) return null;
    const token = header.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
}
