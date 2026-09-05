import { describe, expect, test } from "bun:test";
import { issueSessionToken } from "../utils/token";
import { resolveClientKey } from "./clientKey";

// The regression this guards: Socket.IO takes handshake.address from the TCP
// peer and does not honour trust proxy, so behind Caddy every user resolved to
// the same key and shared one 20-per-minute bucket globally.

const CADDY_IP = "172.18.0.4";

function handshake(over: Record<string, any> = {}) {
    return {
        address: CADDY_IP,
        headers: {} as Record<string, string | string[] | undefined>,
        auth: {} as Record<string, unknown>,
        ...over
    };
}

describe("resolveClientKey", () => {
    test("gives two different sessions two different keys behind one proxy address", () => {
        const alice = issueSessionToken("device-alice");
        const bob = issueSessionToken("device-bob");

        const aliceKey = resolveClientKey(handshake({ auth: { token: alice } }));
        const bobKey = resolveClientKey(handshake({ auth: { token: bob } }));

        expect(aliceKey).not.toBe(bobKey);
    });

    test("prefers the verified session over the network address", () => {
        const token = issueSessionToken("device-alice");

        const key = resolveClientKey(
            handshake({
                auth: { token },
                headers: { "x-forwarded-for": "203.0.113.7" }
            })
        );

        expect(key).toBe("session:device-alice");
    });

    test("ignores a forged token and falls back to the network address", () => {
        const key = resolveClientKey(
            handshake({
                auth: { token: "v1.bogus.signature" },
                headers: { "x-forwarded-for": "203.0.113.7" }
            })
        );

        expect(key).toBe("ip:203.0.113.7");
    });

    test("takes the proxy-appended entry, not a client-spoofed prefix", () => {
        // A client that sets its own X-Forwarded-For gets its value placed to the
        // LEFT of the entry Caddy appends. Trusting the leftmost entry would let
        // anyone mint an unlimited number of buckets.
        const key = resolveClientKey(
            handshake({
                headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.7" }
            })
        );

        expect(key).toBe("ip:203.0.113.7");
    });

    test("handles the header arriving as an array", () => {
        const key = resolveClientKey(
            handshake({ headers: { "x-forwarded-for": ["203.0.113.7"] } })
        );

        expect(key).toBe("ip:203.0.113.7");
    });

    test("falls back to the handshake address when no forwarded header is present", () => {
        expect(resolveClientKey(handshake())).toBe(`ip:${CADDY_IP}`);
    });

    test("never returns a bare prefix when everything is missing", () => {
        const key = resolveClientKey({ address: undefined, headers: {}, auth: {} });

        expect(key).toBe("ip:unknown");
    });
});

describe("resolveClientKey behind Render", () => {
    // Render fronts with Cloudflare and its own load balancer, so the observed
    // chain is `client, cloudflare-edge, 10.x-render-internal`. Taking the
    // rightmost entry -- correct behind a single Caddy hop -- would key every
    // user on the same internal 10.x address, which is the global-bucket bug
    // this function exists to prevent.
    const RENDER_CHAIN = "203.0.113.7, 172.71.195.123, 10.226.90.65";

    test("does not key on Render's internal load balancer address", () => {
        const key = resolveClientKey(
            handshake({ headers: { "x-forwarded-for": RENDER_CHAIN } })
        );

        expect(key).not.toBe("ip:10.226.90.65");
    });

    test("prefers CF-Connecting-IP, which Cloudflare overwrites and a client cannot forge", () => {
        const key = resolveClientKey(
            handshake({
                headers: {
                    // A client trying to look like someone else.
                    "x-forwarded-for": "9.9.9.9, " + RENDER_CHAIN,
                    "cf-connecting-ip": "203.0.113.7"
                }
            })
        );

        expect(key).toBe("ip:203.0.113.7");
    });

    test("falls back to True-Client-IP when CF-Connecting-IP is absent", () => {
        const key = resolveClientKey(
            handshake({ headers: { "true-client-ip": "203.0.113.7" } })
        );

        expect(key).toBe("ip:203.0.113.7");
    });

    test("still keys two users behind one edge into separate buckets", () => {
        const a = resolveClientKey(handshake({ headers: { "cf-connecting-ip": "203.0.113.7" } }));
        const b = resolveClientKey(handshake({ headers: { "cf-connecting-ip": "198.51.100.4" } }));

        expect(a).not.toBe(b);
    });

    test("a verified session still outranks any network header", () => {
        const token = issueSessionToken("device-alice");

        const key = resolveClientKey(
            handshake({
                auth: { token },
                headers: { "cf-connecting-ip": "203.0.113.7" }
            })
        );

        expect(key).toBe("session:device-alice");
    });
});
