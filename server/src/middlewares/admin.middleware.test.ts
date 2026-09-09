import { describe, expect, test, beforeEach, mock } from "bun:test";
import { fakeReq, fakeRes, fakeNext } from "../testing/http";
import { requireAdmin } from "./admin.middleware";

// A static import is safe: mock.module patches the live binding even for a
// module already resolved, so the module under test picks up the fake either way.

// requireAdmin is the only thing standing in front of /api/admin/*, which can
// ban accounts and read every abuse report, and it had no test. The two
// properties worth pinning are that it fails CLOSED when unconfigured -- an
// admin API that opens itself when someone forgets an env var is worse than no
// admin API -- and that the comparison stays constant-time.
//
// config is mocked with a mutable object because requireAdmin reads
// config.ADMIN_TOKEN on every call, so a test can vary it without re-importing.

const config = { ADMIN_TOKEN: "s3cret-admin-token", NODE_ENV: "test" };
mock.module("../config/env", () => ({ config }));


beforeEach(() => {
    config.ADMIN_TOKEN = "s3cret-admin-token";
});

const call = (headers: Record<string, string>) => {
    const res = fakeRes();
    const next = fakeNext();
    requireAdmin(fakeReq({ headers }) as any, res as any, next as any);
    return { res, next };
};

describe("requireAdmin when ADMIN_TOKEN is not configured", () => {
    // 503, not 200 and not 401: the route is unreachable rather than open, and
    // the status says "this is broken", not "your credential is wrong".
    test("refuses every request rather than opening the route", () => {
        config.ADMIN_TOKEN = "";

        const { res, next } = call({ authorization: "Bearer s3cret-admin-token" });

        expect(res.statusCode).toBe(503);
        expect(next.called).toBe(false);
    });

    test("refuses even a request presenting an empty token", () => {
        config.ADMIN_TOKEN = "";

        const { res, next } = call({ authorization: "Bearer " });

        expect(res.statusCode).toBe(503);
        expect(next.called).toBe(false);
    });
});

describe("requireAdmin", () => {
    test("admits the configured token", () => {
        const { res, next } = call({ authorization: "Bearer s3cret-admin-token" });

        expect(next.called).toBe(true);
        expect(res.statusCode).toBeNull();
    });

    test("rejects a wrong token", () => {
        const { res, next } = call({ authorization: "Bearer wrong-token" });

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "Unauthorized" });
        expect(next.called).toBe(false);
    });

    test("rejects a missing Authorization header", () => {
        const { res, next } = call({});

        expect(res.statusCode).toBe(401);
        expect(next.called).toBe(false);
    });

    test("rejects a non-Bearer scheme carrying the right secret", () => {
        const { res, next } = call({ authorization: "Basic s3cret-admin-token" });

        expect(res.statusCode).toBe(401);
        expect(next.called).toBe(false);
    });

    // A prefix must not pass. Comparing hashes rather than raw strings is what
    // makes this safe against both length leaks and early-exit timing.
    test("rejects a token that is only a prefix of the real one", () => {
        const { res } = call({ authorization: "Bearer s3cret-admin-toke" });

        expect(res.statusCode).toBe(401);
    });

    test("rejects a token that merely contains the real one", () => {
        const { res } = call({ authorization: "Bearer xxs3cret-admin-tokenxx" });

        expect(res.statusCode).toBe(401);
    });

    // timingSafeEqual throws on a length mismatch, which is exactly why the
    // implementation hashes both sides to a fixed 32 bytes first. A wildly
    // different length must produce a clean 401, never a 500.
    test("survives a token of a wildly different length", () => {
        const { res, next } = call({ authorization: `Bearer ${"a".repeat(5000)}` });

        expect(res.statusCode).toBe(401);
        expect(next.called).toBe(false);
    });

    test("does not echo the presented credential back to the caller", () => {
        const { res } = call({ authorization: "Bearer wrong-token" });

        expect(JSON.stringify(res.body)).not.toContain("wrong-token");
    });
});
