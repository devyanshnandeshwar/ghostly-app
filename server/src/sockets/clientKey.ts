import { verifySessionToken } from "../utils/token";

/**
 * Which bucket a socket's rate limit belongs to.
 *
 * Socket.IO takes `handshake.address` from the TCP peer and, unlike Express,
 * honours no `trust proxy` setting. Behind a proxy that address is the proxy's,
 * identically for every connection, which put the entire user base into one
 * bucket -- the twenty-first connection in any minute was rejected no matter
 * who made it.
 *
 * Getting the replacement right is platform-specific and easy to get subtly
 * wrong in the same direction:
 *
 *   Caddy (one hop)  X-Forwarded-For: <client>
 *   Render           X-Forwarded-For: <client>, <cloudflare-edge>, <10.x-render-lb>
 *
 * Taking the RIGHTMOST entry is correct behind a single trusted proxy and
 * catastrophic on Render, where it yields the internal load balancer -- the
 * same value for everyone, which is the original bug wearing a new hat. Taking
 * the LEFTMOST is wrong everywhere: Render appends to a client-supplied header
 * rather than replacing it, so the leftmost entry is whatever the caller
 * invented.
 *
 * So we do not parse the chain when we do not have to. Cloudflare overwrites
 * CF-Connecting-IP on every request and it cannot be forged from outside, which
 * makes it the only header here that is trustworthy by construction.
 */

// Used only for the X-Forwarded-For fallback, where the chain must be parsed.
// One trusted hop matches app.ts's `trust proxy` setting for a single-proxy
// deployment; override where the topology differs.
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);

export interface ClientKeyHandshake {
    address?: string;
    headers?: Record<string, string | string[] | undefined>;
    auth?: Record<string, unknown>;
}

function header(headers: ClientKeyHandshake["headers"], name: string): string | null {
    const raw = headers?.[name];
    if (!raw) return null;

    const value = (Array.isArray(raw) ? raw[0] : raw).trim();
    return value || null;
}

/**
 * Addresses that cannot belong to a real client.
 *
 * A private or loopback address in this position means the hop count is wrong
 * for the platform. Keying on one is the worst available outcome, because every
 * user behind that proxy collapses into a single bucket -- so treat it as a
 * signal to keep looking rather than an answer.
 */
function isInternal(address: string): boolean {
    const ip = address.replace(/^::ffff:/, "");
    return (
        ip === "::1" ||
        ip.startsWith("127.") ||
        ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
        ip.startsWith("fc") ||
        ip.startsWith("fd")
    );
}

function forwardedFor(headers: ClientKeyHandshake["headers"]): string | null {
    const raw = headers?.["x-forwarded-for"];
    if (!raw) return null;

    const entries = (Array.isArray(raw) ? raw.join(",") : raw)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

    if (entries.length === 0) return null;

    // Count in from the right: the entries a trusted proxy appended are the
    // only ones a client could not have written.
    const start = Math.max(0, entries.length - TRUSTED_PROXY_HOPS);

    // Safety net, not the mechanism. If the configured hop count lands on an
    // internal address the count is wrong for this platform, so walk left to
    // the nearest address that could plausibly be a client. That still may not
    // be the true client -- only CF-Connecting-IP gives that on Render -- but
    // it keeps users in per-edge buckets instead of one global one.
    for (let i = start; i >= 0; i--) {
        const candidate = entries[i];
        if (candidate && !isInternal(candidate)) return candidate;
    }

    return null;
}

/** The real client address, by the most trustworthy route available. */
function clientAddress(handshake: ClientKeyHandshake): string {
    return (
        header(handshake.headers, "cf-connecting-ip") ??
        header(handshake.headers, "true-client-ip") ??
        forwardedFor(handshake.headers) ??
        handshake.address ??
        "unknown"
    );
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

    return `ip:${clientAddress(handshake)}`;
}
