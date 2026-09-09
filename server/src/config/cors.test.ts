import { describe, expect, test } from "bun:test";
import { buildCorsOrigins, assertUsableClientUrl } from "./cors";

// The regression this guards: the localhost entries were unconditional, so a
// page a victim runs on their own machine on :3000 or :5173 could make
// credentialed cross-origin calls against production.

describe("buildCorsOrigins", () => {
    test("allows only the configured origin in production", () => {
        const origins = buildCorsOrigins("https://devyansh.tech", "production");

        expect(origins).toEqual(["https://devyansh.tech"]);
    });

    test("admits no localhost origin in production", () => {
        const origins = buildCorsOrigins("https://devyansh.tech", "production");

        expect(origins.some((o) => o.includes("localhost"))).toBe(false);
        expect(origins.some((o) => o.includes("127.0.0.1"))).toBe(false);
    });

    test("keeps the local dev origins outside production", () => {
        const origins = buildCorsOrigins("http://localhost:5173", "development");

        expect(origins).toContain("http://localhost:3000");
        expect(origins).toContain("http://localhost:5173");
        expect(origins).toContain("http://127.0.0.1:3000");
        expect(origins).toContain("http://127.0.0.1:5173");
    });

    test("does not repeat an origin that is also a dev default", () => {
        const origins = buildCorsOrigins("http://localhost:5173", "development");

        expect(origins.filter((o) => o === "http://localhost:5173")).toHaveLength(1);
    });

    test("puts the configured origin first outside production", () => {
        const origins = buildCorsOrigins("https://staging.example.com", "staging");

        expect(origins[0]).toBe("https://staging.example.com");
    });
});

describe("buildCorsOrigins across a split deployment", () => {
    // The SPA now lives on Vercel and the API on Render, so CORS stops being
    // incidental and becomes the thing that decides whether the product works
    // at all. A deploy usually needs both the platform domain and a custom one.
    test("accepts a comma-separated list of production origins", () => {
        const origins = buildCorsOrigins(
            "https://ghostly.vercel.app, https://ghostly.dev",
            "production"
        );

        expect(origins).toEqual(["https://ghostly.vercel.app", "https://ghostly.dev"]);
    });

    test("ignores blank entries and stray whitespace", () => {
        const origins = buildCorsOrigins("https://ghostly.dev, ,  ", "production");

        expect(origins).toEqual(["https://ghostly.dev"]);
    });

    test("still admits no localhost origin in production", () => {
        const origins = buildCorsOrigins(
            "https://ghostly.vercel.app,https://ghostly.dev",
            "production"
        );

        expect(origins.some((o) => o.includes("localhost"))).toBe(false);
    });

    test("keeps every configured origin alongside the dev defaults outside production", () => {
        const origins = buildCorsOrigins("https://preview.vercel.app", "development");

        expect(origins).toContain("https://preview.vercel.app");
        expect(origins).toContain("http://localhost:5173");
    });
});

// The regression these guard: buildCorsOrigins strips the hardcoded dev origins
// in production, but it cannot tell that the CONFIGURED origin is itself
// localhost -- and env.ts defaults CLIENT_URL to http://localhost:5173. So a
// production deploy that simply forgot to set CLIENT_URL served
// CORS_ORIGINS = ["http://localhost:5173"] with credentials: true: exactly the
// hole the file's own docblock says was closed.
//
// The suite above never caught it because every case passes an explicit,
// non-localhost origin -- it only ever tested the path where someone remembered.
describe("assertUsableClientUrl", () => {
    test("accepts a real origin in production", () => {
        expect(() =>
            assertUsableClientUrl("https://ghostly.dev", "production")
        ).not.toThrow();
    });

    test("accepts a comma-separated list of real origins", () => {
        expect(() =>
            assertUsableClientUrl("https://ghostly.vercel.app, https://ghostly.dev", "production")
        ).not.toThrow();
    });

    // The actual bug: this is the value CLIENT_URL takes when nobody sets it.
    test("refuses the localhost value an unset CLIENT_URL falls back to", () => {
        expect(() =>
            assertUsableClientUrl("http://localhost:5173", "production")
        ).toThrow(/CLIENT_URL/);
    });

    test.each([
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://0.0.0.0:8080",
        "http://[::1]:5173"
    ])("refuses the local address %s", (origin) => {
        expect(() => assertUsableClientUrl(origin, "production")).toThrow();
    });

    test("refuses a list where only one entry is local", () => {
        expect(() =>
            assertUsableClientUrl("https://ghostly.dev,http://localhost:5173", "production")
        ).toThrow();
    });

    test("refuses an empty configuration rather than allowing nothing quietly", () => {
        expect(() => assertUsableClientUrl("", "production")).toThrow(/CLIENT_URL/);
        expect(() => assertUsableClientUrl("  ,  ", "production")).toThrow(/CLIENT_URL/);
    });

    test("refuses a value that is not an origin at all", () => {
        expect(() => assertUsableClientUrl("ghostly.dev", "production")).toThrow();
    });

    test("says what to do, naming the variable", () => {
        expect(() => assertUsableClientUrl("http://localhost:5173", "production")).toThrow(
            /CLIENT_URL/
        );
    });

    // A hostname that merely starts with the same letters is not a local one.
    test("does not mistake a public host for a local one", () => {
        expect(() =>
            assertUsableClientUrl("https://localhost-app.example.com", "production")
        ).not.toThrow();
    });

    test("leaves development alone, where localhost is the point", () => {
        expect(() => assertUsableClientUrl("http://localhost:5173", "development")).not.toThrow();
        expect(() => assertUsableClientUrl("", "test")).not.toThrow();
    });
});
