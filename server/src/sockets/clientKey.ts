import { verifySessionToken } from "../utils/token";

/**
 * Which bucket a socket's rate limit belongs to.
 *
 * Socket.IO takes `handshake.address` from the TCP peer and, unlike Express,
 * honours no `trust proxy` setting. Behind Caddy that address is the proxy's
 * container IP for every connection, so keying on it put the entire user base
 * into one bucket -- the twenty-first connection in any minute was rejected no
 * matter who made it.
 */

// Matches app.set("trust proxy", 1): exactly one proxy sits in front, so the
// entry it appended is the last one. Anything to the left was invented by the
// client; trusting that would let a caller mint unlimited buckets.
const TRUSTED_PROXY_HOPS = 1;

export interface ClientKeyHandshake {
    address?: string;
    headers?: Record<string, string | string[] | undefined>;
    auth?: Record<string, unknown>;
}

function forwardedFor(headers: ClientKeyHandshake["headers"]): string | null {
    const raw = headers?.["x-forwarded-for"];
    if (!raw) return null;

    const entries = (Array.isArray(raw) ? raw.join(",") : raw)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

    if (entries.length === 0) return null;

    return entries[entries.length - TRUSTED_PROXY_HOPS] ?? null;
}

/**
 * Prefers the session we can actually verify, so a user's limit follows them
 * across reconnects and cannot be reset by reconnecting from a new address.
 * Unauthenticated handshakes fall back to the real client IP.
 */
export function resolveClientKey(handshake: ClientKeyHandshake): string {
    const token = handshake.auth?.token;

    if (typeof token === "string") {
        const payload = verifySessionToken(token);
        if (payload) return `session:${payload.deviceId}`;
    }

    return `ip:${forwardedFor(handshake.headers) ?? handshake.address ?? "unknown"}`;
}
