import { describe, expect, test } from "bun:test";
import { buildCorsOrigins } from "./cors";

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
