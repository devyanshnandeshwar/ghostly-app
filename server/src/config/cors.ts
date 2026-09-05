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

export function buildCorsOrigins(clientUrl: string, nodeEnv: string): string[] {
    const origins =
        nodeEnv === "production" ? [clientUrl] : [clientUrl, ...LOCAL_DEV_ORIGINS];

    return origins.filter((origin, i, arr) => arr.indexOf(origin) === i);
}
