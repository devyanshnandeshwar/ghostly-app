/**
 * Whether MONGO_URI and REDIS_URL are fit to serve production traffic.
 *
 * Both had defaults and no guard. `MONGO_URI` missing produced a console.warn
 * and then env.ts substituted `mongodb://localhost:27017/ghostly` anyway, so a
 * misconfigured Render deploy spent 30 seconds in mongoose server selection and
 * exited 1 complaining about a cluster nobody had configured. `REDIS_URL` was
 * worse: no validation at all, a silent localhost default, and -- before
 * connectRedis() grew a boot timeout -- a process that then hung forever
 * without ever opening a port.
 *
 * SESSION_SECRET and CLIENT_URL already refuse to boot on a bad value
 * (sessionSecret.ts, cors.ts). These are the two remaining production-critical
 * variables that did not, which is the inconsistency this closes.
 *
 * Every check here is a shape check. It cannot tell a reachable cluster from an
 * unreachable one -- only that nobody remembered to set the variable.
 */

/**
 * Anchored on the whole host, so `localhost-db.example.com` stays valid.
 * Mirrors the deliberately narrow pattern in cors.ts.
 */
const LOOPBACK_HOST =
    /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|\[::1\])$/i;

/**
 * Pulls the host out without a full URL parse.
 *
 * `new URL()` cannot be trusted here: it rejects `mongodb+srv://` in some
 * runtimes, and a connection string's password may contain characters that
 * break parsing well before we reach the host we actually want.
 */
const hostOf = (url: string): string => {
    const afterScheme = url.split("://")[1] ?? "";
    const afterCredentials = afterScheme.split("@").pop() ?? "";
    const hostAndPort = afterCredentials.split(/[/?]/)[0] ?? "";
    // Strip the port, but leave a bracketed IPv6 literal intact.
    return hostAndPort.startsWith("[")
        ? (hostAndPort.split("]")[0] ?? "") + "]"
        : (hostAndPort.split(":")[0] ?? "");
};

const isLoopback = (url: string): boolean => LOOPBACK_HOST.test(hostOf(url));

export function assertUsableDatastoreUrls(
    mongoUri: string,
    redisUrl: string,
    nodeEnv: string
): void {
    if (nodeEnv !== "production") return;

    const problems: string[] = [];

    if (!mongoUri.trim()) {
        problems.push("MONGO_URI is not set.");
    } else if (isLoopback(mongoUri)) {
        problems.push(
            "MONGO_URI still points at localhost, which is the development " +
                "default. Set the Atlas connection string in the Render dashboard."
        );
    }

    if (!redisUrl.trim()) {
        problems.push("REDIS_URL is not set.");
    } else if (isLoopback(redisUrl)) {
        problems.push(
            "REDIS_URL still points at localhost, which is the development " +
                "default. Set the Upstash URL in the Render dashboard."
        );
    } else if (redisUrl.startsWith("redis://")) {
        // Not pedantry about schemes: a managed Redis that requires TLS accepts
        // the TCP handshake on a plaintext connection and then closes it. The
        // client reports "Socket closed unexpectedly" and reconnects forever,
        // naming neither TLS nor the URL.
        problems.push(
            "REDIS_URL uses plaintext redis://. A managed Redis (Upstash) " +
                "requires TLS -- use rediss:// instead."
        );
    }

    if (problems.length > 0) {
        throw new Error(`[Config] ${problems.join(" ")}`);
    }
}
