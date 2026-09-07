import { describe, expect, test } from "bun:test";
import { assertUsableSessionSecret } from "./sessionSecret";

// The regression this guards: env.ts refused to boot production only when the
// secret was exactly "supersecret", while .env.example shipped
// "supersecret_change_me". Copying the example -- the documented way to make an
// .env -- produced a value the guard waved through, signing every session token
// with a string that is in git history.

describe("assertUsableSessionSecret in production", () => {
    const strong = "a3f1c9d2b8e47a06f5c31d9e2b7a48c06f5d31e9a2b7c48d06f5e31a9b2c7d48e";

    test("accepts a value from openssl rand -hex 32", () => {
        expect(() => assertUsableSessionSecret(strong, "production")).not.toThrow();
    });

    test("rejects the built-in development default", () => {
        expect(() => assertUsableSessionSecret("supersecret", "production")).toThrow();
    });

    test("rejects the value .env.example ships", () => {
        expect(() =>
            assertUsableSessionSecret("supersecret_change_me", "production")
        ).toThrow();
    });

    test("rejects an unset secret", () => {
        expect(() => assertUsableSessionSecret("", "production")).toThrow();
    });

    test("rejects anything shorter than 32 characters", () => {
        expect(() => assertUsableSessionSecret("a".repeat(31), "production")).toThrow();
    });

    test("names the variable in the failure so the log is actionable", () => {
        expect(() => assertUsableSessionSecret("supersecret_change_me", "production")).toThrow(
            /SESSION_SECRET/
        );
    });
});

describe("assertUsableSessionSecret outside production", () => {
    test("leaves a weak secret alone in development", () => {
        expect(() =>
            assertUsableSessionSecret("supersecret_change_me", "development")
        ).not.toThrow();
    });

    test("leaves a weak secret alone under test", () => {
        expect(() => assertUsableSessionSecret("supersecret", "test")).not.toThrow();
    });
});
