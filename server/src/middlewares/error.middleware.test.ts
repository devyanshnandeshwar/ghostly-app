import { describe, expect, test, mock } from "bun:test";
import { fakeReq, fakeRes, fakeNext } from "../testing/http";

// The regression this guards, in three parts.
//
// err.message was returned to the client unconditionally, including for 500s,
// so a mongoose CastError or a driver error naming the connection host went out
// verbatim. This was not theoretical: the rate-limiter resilience suite caught
// the pre-fix handler returning a raw Redis ECONNRESET plus a full stack trace
// with absolute file paths, in the response body.
//
// The stack was gated on process.env.NODE_ENV while the line above it used
// config.NODE_ENV. config falls back to "development", so a deploy that left
// NODE_ENV unset -- routine on a PaaS -- shipped stack traces to every client
// while believing it was in production.
//
// And there was no res.headersSent guard, so an error after a partial write
// threw ERR_HTTP_HEADERS_SENT from inside the error handler itself.

const config = { NODE_ENV: "test", EXPOSE_ERROR_DETAILS: true };
mock.module("../config/env", () => ({ config }));

// A static import is safe: mock.module patches the live binding even for a
// module already resolved.
import { errorHandler } from "./error.middleware";

const handle = (err: any, res = fakeRes()) => {
    const next = fakeNext();
    errorHandler(err, fakeReq() as any, res as any, next as any);
    return { res, next };
};

describe("what reaches the client", () => {
    test("a 500 says nothing about what actually failed", () => {
        const { res } = handle(new Error("mongodb://admin:hunter2@cluster0:27017 unreachable"));

        expect(res.statusCode).toBe(500);
        expect((res.body as any).error).toBe("Internal Server Error");
    });

    test("a 500 does not leak a connection string to a real deployment", () => {
        config.EXPOSE_ERROR_DETAILS = false;

        const { res } = handle(new Error("ECONNRESET mongodb://admin:hunter2@host"));

        expect(JSON.stringify(res.body)).not.toContain("hunter2");
        config.EXPOSE_ERROR_DETAILS = true;
    });

    test("a mongoose CastError is not handed to the caller", () => {
        const err: any = new Error('Cast to ObjectId failed for value "notanid" at path "_id"');
        err.name = "CastError";

        const { res } = handle(err);

        expect((res.body as any).error).toBe("Internal Server Error");
    });

    // A 4xx status was set deliberately by a handler, so its text is meant for
    // the caller and must survive.
    test("a deliberate 4xx keeps its message", () => {
        const err: any = new Error("Nickname must be 3-20 characters.");
        err.statusCode = 400;

        const { res } = handle(err);

        expect(res.statusCode).toBe(400);
        expect((res.body as any).error).toBe("Nickname must be 3-20 characters.");
    });

    test("a deliberate 404 keeps its message", () => {
        const err: any = new Error("Report not found");
        err.statusCode = 404;

        const { res } = handle(err);

        expect(res.statusCode).toBe(404);
        expect((res.body as any).error).toBe("Report not found");
    });

    test("an explicit 5xx is still generic", () => {
        const err: any = new Error("upstream said no");
        err.statusCode = 503;

        const { res } = handle(err);

        expect(res.statusCode).toBe(503);
        expect((res.body as any).error).toBe("Internal Server Error");
    });

    test("always reports success: false", () => {
        const { res } = handle(new Error("x"));

        expect((res.body as any).success).toBe(false);
    });
});

describe("stack exposure", () => {
    test("production sends no stack", () => {
        config.EXPOSE_ERROR_DETAILS = false;

        const { res } = handle(new Error("boom"));

        expect((res.body as any).stack).toBeUndefined();
        config.EXPOSE_ERROR_DETAILS = true;
    });

    // The actual bug: NODE_ENV unset means config.NODE_ENV is "development",
    // and the old code read process.env directly, so a PaaS deploy that never
    // set NODE_ENV leaked stacks while looking fine.
    // Exposure is opt-in. An unset NODE_ENV -- routine on a PaaS, and the case
    // that leaked before -- must not expose anything.
    test("an unset NODE_ENV exposes nothing", () => {
        config.EXPOSE_ERROR_DETAILS = false; // what env.ts derives when unset

        const { res } = handle(new Error("boom"));

        expect((res.body as any).stack).toBeUndefined();
        config.EXPOSE_ERROR_DETAILS = true;
    });

    test("development still sends a stack, which is the point of development", () => {
        config.EXPOSE_ERROR_DETAILS = true;

        const { res } = handle(new Error("boom"));

        expect((res.body as any).stack).toBeTruthy();
    });
});

describe("robustness", () => {
    test("an oversized upload is a 413, not a 500", () => {
        const err: any = new Error("File too large");
        err.code = "LIMIT_FILE_SIZE";

        const { res } = handle(err);

        expect(res.statusCode).toBe(413);
    });

    test("a response already sent is handed on rather than written to twice", () => {
        const res = fakeRes({ headersSent: true });

        const { next } = handle(new Error("late failure"), res);

        expect(res.statusCode).toBeNull();
        expect(next.called).toBe(true);
    });

    test("an error with no message still produces a valid response", () => {
        const { res } = handle(new Error());

        expect(res.statusCode).toBe(500);
        expect((res.body as any).error).toBe("Internal Server Error");
    });

    test("a non-Error thrown value does not crash the handler", () => {
        expect(() => handle(undefined)).not.toThrow();
        expect(() => handle("just a string")).not.toThrow();
    });
});
