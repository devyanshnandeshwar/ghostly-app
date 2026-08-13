import crypto from "crypto";
import { config } from "../config/env";

/**
 * Stateless session credentials.
 *
 * The deviceId inside a token is generated server-side and the token is signed
 * with SESSION_SECRET, so a client cannot mint a credential for a session it
 * does not own. Never authenticate on a raw client-supplied deviceId.
 */

const TOKEN_VERSION = "v1";

export interface SessionTokenPayload {
    deviceId: string;
    issuedAt: number;
}

function sign(body: string): string {
    return crypto
        .createHmac("sha256", config.SESSION_SECRET)
        .update(body)
        .digest("base64url");
}

export function issueSessionToken(deviceId: string): string {
    const payload: SessionTokenPayload = {
        deviceId,
        issuedAt: Date.now()
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
        return payload as SessionTokenPayload;
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
