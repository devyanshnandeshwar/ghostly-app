import { describe, expect, test } from "bun:test";
import { resolveClientIp } from "./clientIp";

// Who a caller is, decided identically for HTTP and for sockets.
//
// The socket path solved this; the Express path did not, and still trusted one
// proxy hop with a comment naming Caddy -- a proxy that no longer exists. On
// Render the chain is `client, cloudflare-edge, 10.x-render-lb`, so counting one
// hop in from the right lands on Render's internal balancer: the same value for
// every visitor, which collapses every unauthenticated caller into one
// rate-limit bucket.
const RENDER_CHAIN = "203.0.113.7, 172.71.195.123, 10.226.90.65";

describe("resolveClientIp", () => {
    test("prefers CF-Connecting-IP, which Cloudflare overwrites and a client cannot forge", () => {
        const ip = resolveClientIp({
            headers: {
                // A caller trying to look like someone else.
                "x-forwarded-for": "9.9.9.9, " + RENDER_CHAIN,
                "cf-connecting-ip": "203.0.113.7"
            }
        });

        expect(ip).toBe("203.0.113.7");
    });

    test("falls back to True-Client-IP when CF-Connecting-IP is absent", () => {
        expect(resolveClientIp({ headers: { "true-client-ip": "203.0.113.7" } })).toBe(
            "203.0.113.7"
        );
    });

    test("never resolves to a platform-internal address", () => {
        // The failure that matters: one shared bucket for the whole user base.
        expect(resolveClientIp({ headers: { "x-forwarded-for": RENDER_CHAIN } })).not.toBe(
            "10.226.90.65"
        );
    });

    test("keeps two callers behind one edge in separate buckets", () => {
        const a = resolveClientIp({ headers: { "cf-connecting-ip": "203.0.113.7" } });
        const b = resolveClientIp({ headers: { "cf-connecting-ip": "198.51.100.4" } });

        expect(a).not.toBe(b);
    });

    test("falls back to the socket address when no proxy header is present", () => {
        expect(resolveClientIp({ headers: {}, socketAddress: "198.51.100.4" })).toBe(
            "198.51.100.4"
        );
    });

    test("returns a stable placeholder rather than undefined when nothing is known", () => {
        // Returning undefined would make the rate-limit key literally
        // "ip:undefined" -- one shared bucket by another route.
        expect(resolveClientIp({ headers: {} })).toBe("unknown");
    });

    test("handles a header delivered as an array", () => {
        expect(
            resolveClientIp({ headers: { "cf-connecting-ip": ["203.0.113.7"] } })
        ).toBe("203.0.113.7");
    });
});
