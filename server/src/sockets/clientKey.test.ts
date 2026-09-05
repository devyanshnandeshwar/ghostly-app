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
