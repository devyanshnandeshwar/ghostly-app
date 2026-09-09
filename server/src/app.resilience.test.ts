import { describe, expect, test, beforeAll, afterAll, mock } from "bun:test";
import http from "http";
import type express from "express";

// The regression this guards: express-rate-limit defaults passOnStoreError to
// false and rethrows a store error. Express 5 turns that into next(err), the
// error handler answers 500, and because globalLimiter was mounted app-wide,
// one transient Redis failure meant EVERY route returned 500 -- including
// /health, which was also mounted behind the limiter and could earn a 429 on
// its own from a 5s platform probe (180 requests per 15-minute window).
//
// The platform then cycled the container for being unhealthy, which does
// nothing about a Redis outage. A blip became a restart loop.
//
// Redis is mocked to fail the way a real outage does: connected, but every
// command rejects.

const redisClient = {
    isOpen: true,
    sendCommand: async () => {
        throw new Error("ECONNRESET: redis went away");
    },
    incr: async () => {
        throw new Error("ECONNRESET: redis went away");
    },
    expire: async () => {
        throw new Error("ECONNRESET: redis went away");
    },
    get: async () => {
        throw new Error("ECONNRESET: redis went away");
    },
    set: async () => {
        throw new Error("ECONNRESET: redis went away");
    },
    ttl: async () => {
        throw new Error("ECONNRESET: redis went away");
    },
    on: () => {}
};

mock.module("./config/redis", () => ({
    redisClient,
    redisReady: Promise.resolve(),
    connectRedis: async () => {}
}));

// Mongo is mocked too: this test is about the middleware chain, and
// /session/init is the one route that stacks a second limiter on top of the
// global one. Without this it would hang on mongoose's command buffering and
// tell us nothing about the limiter.
//
// quota.service is deliberately NOT mocked. Its getFilterUsage already degrades
// to zeros when Redis throws, which is the behaviour under test anyway, and
// mocking it here leaked a stub into quota.service.test.ts whenever the suite
// ran without --isolate.
mock.module("./services/session.service", () => ({
    // Every export, not just the ones this test drives: mock.module replaces the
    // whole module, so an omission breaks any other file that imports it.
    createSession: async () => ({
        _id: "sess-1",
        deviceId: "device-1",
        tokenVersion: 0,
        isVerified: false,
        gender: null
    }),
    getSessionByDeviceId: async () => null,
    getAuthSession: async () => null,
    invalidateAuthCache: () => {},
    getQueueSessionView: async () => null,
    invalidateSessionCache: async () => {},
    updateSession: async () => null,
    touchLastActive: async () => {},
    revokeSession: async () => {}
}));

// Imported dynamically inside beforeAll, NOT statically: ESM hoists static
// imports above the mock.module() call above, so app.ts -- and with it the
// Redis-backed rate-limit stores -- would be evaluated against the real
// config/redis. Those stores await redisReady, which nothing resolves in a
// test, so every request through globalLimiter hangs forever rather than
// failing. A timeout with no error is the worst way for this to go wrong.
let server: http.Server;
let base: string;

beforeAll(async () => {
    // Interop shim: app.ts is emitted as CommonJS, so depending on how the
    // runtime hands it back the express app can sit at .default, .default.default
    // or be the namespace itself. Unwrapping defensively keeps this test about
    // the middleware chain rather than about module formats.
    const mod: any = await import("./app.js");
    const app: express.Express = mod.default?.default ?? mod.default ?? mod;

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("the API with Redis unreachable", () => {
    // The one that matters most: an unhealthy answer here gets the container
    // restarted, and a restart does not bring Redis back.
    test("/health still answers OK", async () => {
        const res = await fetch(`${base}/health`);

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: "OK" });
    });

    test("/health answers repeatedly, so a 5s probe cannot rate-limit itself", async () => {
        for (let i = 0; i < 25; i++) {
            const res = await fetch(`${base}/health`);
            expect(res.status).toBe(200);
        }
    });

    // A rate limiter is a defence against abuse, not a dependency of the
    // product: with its store down, requests pass rather than 500.
    test("an ordinary route is not turned into a 500 by the limiter", async () => {
        const res = await fetch(`${base}/api/v1/profile/update`, { method: "POST" });

        expect(res.status).not.toBe(500);
        expect(res.status).toBe(401); // rejected on its own merits, by auth
    });

    test("the versioned and unversioned prefixes behave the same", async () => {
        const versioned = await fetch(`${base}/api/v1/profile/update`, { method: "POST" });
        const legacy = await fetch(`${base}/api/profile/update`, { method: "POST" });

        expect(versioned.status).toBe(401);
        expect(legacy.status).toBe(401);
    });

    test("no response leaks the underlying Redis failure", async () => {
        const res = await fetch(`${base}/api/v1/profile/update`, { method: "POST" });

        expect(await res.text()).not.toContain("ECONNRESET");
    });
});

describe("a route behind two limiters", () => {
    // /session/init stacks sessionLimiter on top of globalLimiter, so it is
    // where a fail-closed store would bite twice. It is also the first call
    // every new visitor makes: 500 here and nobody can use the product at all.
    test("session init is not blocked by the limiter with Redis down", async () => {
        const res = await fetch(`${base}/api/v1/session/init`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({})
        });

        expect(res.status).toBe(200);
    });
});

describe("/health placement", () => {
    test("answers before the JSON body parser and the sanitiser can matter", async () => {
        const res = await fetch(`${base}/health`, {
            method: "GET",
            headers: { "content-type": "application/json" }
        });

        expect(res.status).toBe(200);
    });
});
