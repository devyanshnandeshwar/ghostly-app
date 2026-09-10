/**
 * The real client address behind a platform proxy.
 *
 * Shared by the HTTP rate limiter and the socket handshake, because a caller
 * who is one identity to one layer and a different identity to the other is a
 * bug waiting to happen. It previously lived only in sockets/clientKey.ts, so
 * Express kept its own answer -- `trust proxy: 1`, with a comment naming Caddy,
 * a proxy that no longer fronts this app.
 *
 * Getting this wrong is easy and fails in one direction:
 *
 *   Caddy (one hop)  X-Forwarded-For: <client>
 *   Render           X-Forwarded-For: <client>, <cloudflare-edge>, <10.x-render-lb>
 *
 * Taking the RIGHTMOST entry is right behind a single trusted proxy and wrong on
 * Render, where it yields the internal balancer -- one value for everyone, which
 * puts the entire user base in a single rate-limit bucket. Taking the LEFTMOST
 * is wrong everywhere, because a proxy appends to a client-supplied header
 * rather than replacing it, so the leftmost entry is whatever the caller typed.
 *
 * So prefer not to parse the chain at all. Cloudflare overwrites
 * CF-Connecting-IP on every request and it cannot be set from outside, which
 * makes it the only header here trustworthy by construction.
 */

// Used only for the X-Forwarded-For fallback, where the chain must be parsed.
// One hop suits a single-proxy deployment; override where the topology differs.
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);

export type HeaderBag = Record<string, string | string[] | undefined>;

export interface ClientIpSource {
    headers?: HeaderBag;
    /** The raw peer address, used only when no proxy header is usable. */
    socketAddress?: string;
}

function header(headers: HeaderBag | undefined, name: string): string | null {
    const raw = headers?.[name];
    if (!raw) return null;

    const value = (Array.isArray(raw) ? raw[0] : raw).trim();
    return value || null;
}

/**
 * Addresses that cannot belong to a real client.
 *
 * A private or loopback address in this position means the hop count is wrong
 * for the platform. Keying on one is the worst available outcome, so treat it
 * as a signal to keep looking rather than as an answer.
 */
export function isInternalAddress(address: string): boolean {
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

function forwardedFor(headers: HeaderBag | undefined): string | null {
    const raw = headers?.["x-forwarded-for"];
    if (!raw) return null;

    const entries = (Array.isArray(raw) ? raw.join(",") : raw)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

    if (entries.length === 0) return null;

    // Count in from the right: entries a trusted proxy appended are the only
    // ones a client could not have written.
    const start = Math.max(0, entries.length - TRUSTED_PROXY_HOPS);

    // Safety net, not the mechanism. If the configured hop count lands on an
    // internal address the count is wrong for this platform, so walk left to the
    // nearest address that could plausibly be a client. That may still not be
    // the true client -- only CF-Connecting-IP gives that on Render -- but it
    // keeps callers in per-edge buckets instead of one global one.
    for (let i = start; i >= 0; i--) {
        const candidate = entries[i];
        if (candidate && !isInternalAddress(candidate)) return candidate;
    }

    return null;
}

export function resolveClientIp(source: ClientIpSource): string {
    return (
        header(source.headers, "cf-connecting-ip") ??
        header(source.headers, "true-client-ip") ??
        forwardedFor(source.headers) ??
        source.socketAddress ??
        "unknown"
    );
}
