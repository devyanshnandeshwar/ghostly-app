import { verifySessionToken } from "../utils/token";
import { resolveClientIp, type HeaderBag } from "../config/clientIp";

/**
 * Which bucket a socket's rate limit belongs to.
 *
 * Socket.IO takes `handshake.address` from the TCP peer and, unlike Express,
 * honours no `trust proxy` setting -- behind a proxy that address is the
 * proxy's, identically for every connection, which put the entire user base in
 * one bucket.
 *
 * The address resolution itself now lives in config/clientIp.ts, shared with the
 * HTTP rate limiter. Two layers disagreeing about who a caller is was how the
 * Express path kept trusting a hop count that named a proxy we no longer run.
 */

export interface ClientKeyHandshake {
    address?: string;
    headers?: HeaderBag;
    auth?: Record<string, unknown>;
}

/**
 * Prefers the session we can actually verify, so a user's limit follows them
 * across reconnects and cannot be reset by reconnecting from a new address.
 * Unauthenticated handshakes fall back to the client address.
 */
export function resolveClientKey(handshake: ClientKeyHandshake): string {
    const token = handshake.auth?.token;

    if (typeof token === "string") {
        const payload = verifySessionToken(token);
        if (payload) return `session:${payload.deviceId}`;
    }

    return `ip:${resolveClientIp({
        headers: handshake.headers,
        socketAddress: handshake.address
    })}`;
}
