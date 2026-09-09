/**
 * Which origins may make credentialed cross-origin calls.
 *
 * The localhost entries used to be unconditional, so in production a page the
 * victim happened to be running on their own machine on :3000 or :5173 was an
 * allowed origin. The impact is limited while the credential is a Bearer token
 * in localStorage rather than a cookie -- but it becomes a direct account
 * takeover path the moment that moves to a cookie, which is the planned fix for
 * session revocation.
 */

const LOCAL_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173"
];

/**
 * `clientUrl` may be a single origin or a comma-separated list. The split
 * deployment usually needs at least two -- the platform domain the SPA is
 * served from and whatever custom domain points at it -- and a mismatch here
 * does not degrade gracefully: the socket handshake is simply refused.
 */
export function buildCorsOrigins(clientUrl: string, nodeEnv: string): string[] {
    const configured = clientUrl
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

    const origins =
        nodeEnv === "production" ? configured : [...configured, ...LOCAL_DEV_ORIGINS];

    return origins.filter((origin, i, arr) => arr.indexOf(origin) === i);
}

/**
 * Refuses to boot production with a client origin that is not one.
 *
 * buildCorsOrigins strips the hardcoded LOCAL_DEV_ORIGINS in production, but it
 * cannot tell that the *configured* origin is itself localhost -- and env.ts
 * defaults CLIENT_URL to http://localhost:5173. So a production deploy that
 * simply forgot to set CLIENT_URL got exactly the hole the docblock above says
 * was closed: localhost allowed, with credentials: true.
 *
 * Same shape as assertUsableSessionSecret, and for the same reason: a
 * misconfiguration that silently weakens security is worth a refusal to start,
 * because nothing downstream will ever report it.
 */
// Anchored on the whole host, with an optional port. A prefix match would
// reject localhost-app.example.com, which is a perfectly ordinary public host.
const NON_PUBLIC_HOSTS =
    /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

export function assertUsableClientUrl(clientUrl: string, nodeEnv: string): void {
    if (nodeEnv !== "production") return;

    const configured = clientUrl
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (configured.length === 0) {
        throw new Error(
            "CLIENT_URL must be set in production. It is the only origin allowed to " +
                "make credentialed cross-origin calls; unset, it defaults to localhost."
        );
    }

    for (const origin of configured) {
        let host: string;
        try {
            host = new URL(origin).host;
        } catch {
            throw new Error(`CLIENT_URL contains an entry that is not a valid origin: ${origin}`);
        }

        if (NON_PUBLIC_HOSTS.test(host)) {
            throw new Error(
                `CLIENT_URL must not name a local address in production: ${origin}. ` +
                    "A page on the victim's own machine would be an allowed origin."
            );
        }
    }
}
