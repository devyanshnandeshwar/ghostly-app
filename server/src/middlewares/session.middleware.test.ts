import { describe, expect, test, beforeEach, mock } from "bun:test";
import { fakeReq, fakeRes, fakeNext } from "../testing/http";
import { issueSessionToken } from "../utils/token";
import { verifySession } from "./session.middleware";

// A static import is safe: mock.module patches the live binding even for a
// module already resolved, so the module under test picks up the fake either way.

// verifySession authenticates every authenticated HTTP request and had no test.
// The branch that matters most is the tokenVersion check: it is the whole
// mechanism behind single-session revocation, so if it ever stopped rejecting a
// stale version, logging out would silently do nothing.
//
// session.service is mocked so this does not drag in the mongoose model, which
// registers itself globally at import.

let stored: { _id: string; deviceId: string; tokenVersion: number } | null = null;
let lookupError: Error | null = null;

mock.module("../services/session.service", () => ({
    getAuthSession: async (deviceId: string) => {
        if (lookupError) throw lookupError;
        return stored && stored.deviceId === deviceId ? stored : null;
    }
}));


beforeEach(() => {
    stored = { _id: "sess-1", deviceId: "device-1", tokenVersion: 0 };
    lookupError = null;
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("verifySession", () => {
    test("rejects a request with no Authorization header", async () => {
        const res = fakeRes();
        const next = fakeNext();

        await verifySession(fakeReq() as any, res as any, next as any);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "Session token missing" });
        expect(next.called).toBe(false);
    });

    test("rejects a token this server did not sign", async () => {
        const res = fakeRes();
        const next = fakeNext();

        await verifySession(
            fakeReq({ headers: bearer("v1.abc.forged") }) as any,
            res as any,
            next as any
        );

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "Invalid session" });
        expect(next.called).toBe(false);
    });

    test("rejects a validly signed token for a session that no longer exists", async () => {
        stored = null;
        const res = fakeRes();
        const next = fakeNext();

        await verifySession(
            fakeReq({ headers: bearer(issueSessionToken("device-1")) }) as any,
            res as any,
            next as any
        );

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "Invalid session" });
    });

    // The revocation path. Bumping tokenVersion is what lets one leaked
    // credential be killed without rotating SESSION_SECRET for every user.
    test("rejects a token whose version has been revoked", async () => {
        stored = { _id: "sess-1", deviceId: "device-1", tokenVersion: 3 };
        const res = fakeRes();
        const next = fakeNext();

        await verifySession(
            fakeReq({ headers: bearer(issueSessionToken("device-1", { version: 2 })) }) as any,
            res as any,
            next as any
        );

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "Session expired" });
        expect(next.called).toBe(false);
    });

    test("admits a current token and attaches the session", async () => {
        const req = fakeReq({ headers: bearer(issueSessionToken("device-1", { version: 0 })) });
        const res = fakeRes();
        const next = fakeNext();

        await verifySession(req as any, res as any, next as any);

        expect(next.called).toBe(true);
        expect(res.statusCode).toBeNull();
        expect(req.session).toEqual({ _id: "sess-1", deviceId: "device-1", tokenVersion: 0 });
    });

    test("admits a token at a matching non-zero version", async () => {
        stored = { _id: "sess-1", deviceId: "device-1", tokenVersion: 7 };
        const req = fakeReq({ headers: bearer(issueSessionToken("device-1", { version: 7 })) });
        const res = fakeRes();
        const next = fakeNext();

        await verifySession(req as any, res as any, next as any);

        expect(next.called).toBe(true);
    });

    // A lookup failure must not be mistaken for a bad credential: answering 401
    // would tell a user their session is invalid when the database is simply down.
    test("reports a lookup failure as a server error, not a rejected session", async () => {
        lookupError = new Error("connection timed out");
        const res = fakeRes();
        const next = fakeNext();

        await verifySession(
            fakeReq({ headers: bearer(issueSessionToken("device-1")) }) as any,
            res as any,
            next as any
        );

        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({ error: "Session validation failed" });
    });

    test("does not leak the underlying failure to the caller", async () => {
        lookupError = new Error("mongodb://admin:hunter2@cluster0.internal:27017 unreachable");
        const res = fakeRes();

        await verifySession(
            fakeReq({ headers: bearer(issueSessionToken("device-1")) }) as any,
            res as any,
            fakeNext() as any
        );

        expect(JSON.stringify(res.body)).not.toContain("hunter2");
    });
});
