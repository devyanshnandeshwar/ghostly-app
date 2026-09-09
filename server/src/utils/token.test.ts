import { describe, expect, test } from "bun:test";
import {
    issueSessionToken,
    verifySessionToken,
    parseBearer,
    TOKEN_MAX_AGE_MS
} from "./token";

// A session token was previously valid forever: issuedAt was recorded and never
// read, there was no version to bump, and replaying a token also refreshed
// lastActive so the 30-day session TTL never reached it. A single exposure was
// permanent account takeover, and the only remediation available was rotating
// SESSION_SECRET, which logs out every user at once.

describe("issue and verify", () => {
    test("round-trips a session", () => {
        const payload = verifySessionToken(issueSessionToken("device-a"));

        expect(payload?.deviceId).toBe("device-a");
    });

    test("rejects a token signed with a different secret", () => {
        expect(verifySessionToken("v1.eyJhIjoxfQ.not-a-real-signature")).toBeNull();
    });

    test("rejects a malformed token", () => {
        expect(verifySessionToken("garbage")).toBeNull();
        expect(verifySessionToken("")).toBeNull();
        expect(verifySessionToken("v1.only-two-parts")).toBeNull();
    });

    test("rejects a token whose payload was tampered with", () => {
        const token = issueSessionToken("device-a");
        const [version, , signature] = token.split(".");
        const forged = Buffer.from(
            JSON.stringify({ deviceId: "device-victim", issuedAt: Date.now(), v: 0 })
        ).toString("base64url");

        expect(verifySessionToken(`${version}.${forged}.${signature}`)).toBeNull();
    });
});

describe("expiry", () => {
    test("carries the moment it was issued", () => {
        const before = Date.now();
        const payload = verifySessionToken(issueSessionToken("device-a"));

        expect(payload!.issuedAt).toBeGreaterThanOrEqual(before);
    });

    test("refuses a token older than the maximum age", () => {
        const stale = issueSessionToken("device-a", {
            issuedAt: Date.now() - TOKEN_MAX_AGE_MS - 1
        });

        expect(verifySessionToken(stale)).toBeNull();
    });

    test("accepts a token just inside the maximum age", () => {
        const fresh = issueSessionToken("device-a", {
            issuedAt: Date.now() - TOKEN_MAX_AGE_MS + 60_000
        });

        expect(verifySessionToken(fresh)?.deviceId).toBe("device-a");
    });

    test("refuses a token claiming to be issued in the future", () => {
        // Not a real client; a forged issuedAt is the only way to get one, and
        // it would otherwise extend a token's life indefinitely.
        const future = issueSessionToken("device-a", { issuedAt: Date.now() + 60 * 60 * 1000 });

        expect(verifySessionToken(future)).toBeNull();
    });
});

describe("revocation", () => {
    test("carries a token version so a single session can be invalidated", () => {
        const payload = verifySessionToken(issueSessionToken("device-a", { version: 3 }));

        expect(payload!.version).toBe(3);
    });

    test("defaults to version zero so tokens issued before this existed still verify", () => {
        expect(verifySessionToken(issueSessionToken("device-a"))!.version).toBe(0);
    });
});

describe("parseBearer", () => {
    test("extracts a bearer token", () => {
        expect(parseBearer("Bearer abc123")).toBe("abc123");
    });

    test("ignores other schemes and empty values", () => {
        expect(parseBearer("Basic abc123")).toBeNull();
        expect(parseBearer("Bearer   ")).toBeNull();
        expect(parseBearer(undefined)).toBeNull();
    });
});

// Gaps left by the suite above: the payload survives the signature check but is
// still attacker-shaped, and parseBearer is the only thing between a header and
// the verifier.
describe("payloads that pass the signature check but are not sessions", () => {
    const signedPayload = (payload: unknown) => {
        // Re-signs an arbitrary payload with the real secret, so the signature is
        // valid and only the payload contents are under test.
        const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
        const body = `v1.${encoded}`;
        const sig = require("crypto")
            .createHmac("sha256", process.env.SESSION_SECRET)
            .update(body)
            .digest("base64url");
        return `${body}.${sig}`;
    };

    test("refuses a correctly signed literal null", () => {
        expect(verifySessionToken(signedPayload(null))).toBeNull();
    });

    test("refuses a correctly signed payload with no deviceId", () => {
        expect(verifySessionToken(signedPayload({ issuedAt: Date.now(), version: 0 }))).toBeNull();
    });

    test("refuses a deviceId that is an object rather than a string", () => {
        expect(
            verifySessionToken(signedPayload({ deviceId: { $ne: null }, issuedAt: Date.now() }))
        ).toBeNull();
    });

    test("refuses a non-numeric issuedAt", () => {
        expect(verifySessionToken(signedPayload({ deviceId: "d", issuedAt: "now" }))).toBeNull();
    });

    test("refuses a non-finite issuedAt, which would otherwise never look expired", () => {
        expect(verifySessionToken(signedPayload({ deviceId: "d", issuedAt: Infinity }))).toBeNull();
    });
});

describe("parseBearer edge cases", () => {
    test("is case sensitive about the scheme", () => {
        expect(parseBearer("bearer abc")).toBeNull();
    });

    test("ignores a header that is only the scheme", () => {
        expect(parseBearer("Bearer")).toBeNull();
    });

    test("treats a whitespace-only credential as absent", () => {
        expect(parseBearer("Bearer    ")).toBeNull();
    });

    test("trims surrounding whitespace from the credential", () => {
        expect(parseBearer("Bearer  abc  ")).toBe("abc");
    });
});
