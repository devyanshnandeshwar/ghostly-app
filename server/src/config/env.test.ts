import { describe, expect, test } from "bun:test";
import { parseNumberEnv } from "./env";

// The regression this guards: both numeric settings were bare Number() calls,
// and both failed silently in the dangerous direction.
//
//   MIN_VERIFY_CONFIDENCE=high  ->  NaN. verify.service compares `score < NaN`,
//   which is false for every score, so EVERY verification passed the confidence
//   gate -- with no error and no log. The gate was off and nothing said so.
//
//   REPORT_RETENTION_DAYS=abc   ->  NaN, so the `> 0` test in models/Report.ts
//   was false, the TTL index was never declared, and reports accumulated forever.
//
// They also disagreed on operator: `||` rewrote a legitimate 0 to the default,
// and `??` turned an empty string into 0 -- which for retention means "keep
// forever", the opposite of what an empty value suggests.

describe("parseNumberEnv", () => {
    test("parses a plain number", () => {
        expect(parseNumberEnv("0.9", 0.85, "X")).toBe(0.9);
    });

    test("parses an integer", () => {
        expect(parseNumberEnv("365", 365, "X")).toBe(365);
    });

    test("falls back when the variable is unset", () => {
        expect(parseNumberEnv(undefined, 0.85, "X")).toBe(0.85);
    });

    test("falls back on an empty value rather than reading it as zero", () => {
        expect(parseNumberEnv("", 365, "X")).toBe(365);
        expect(parseNumberEnv("   ", 365, "X")).toBe(365);
    });

    // The `||` bug: 0 is a legitimate setting for both variables. For retention
    // it means "keep forever"; silently rewriting it to 365 deletes data the
    // operator asked to keep.
    test("honours an explicit zero instead of treating it as unset", () => {
        expect(parseNumberEnv("0", 365, "X")).toBe(0);
        expect(parseNumberEnv("0", 0.85, "X")).toBe(0);
    });

    // The one that matters: refusing beats returning NaN, because NaN turns
    // every comparison false and disables the gate without a word.
    test("refuses a value that is not a number rather than yielding NaN", () => {
        expect(() => parseNumberEnv("high", 0.85, "MIN_VERIFY_CONFIDENCE")).toThrow();
    });

    test("names the variable in the failure so the log is actionable", () => {
        expect(() => parseNumberEnv("abc", 365, "REPORT_RETENTION_DAYS")).toThrow(
            /REPORT_RETENTION_DAYS/
        );
    });

    test("shows the offending value in the failure", () => {
        expect(() => parseNumberEnv("high", 0.85, "X")).toThrow(/high/);
    });

    test.each(["Infinity", "-Infinity", "NaN", "1,5", "0.9f", "true"])(
        "refuses %p",
        (raw) => {
            expect(() => parseNumberEnv(raw, 1, "X")).toThrow();
        }
    );

    test("accepts a negative number, which is a value question not a format one", () => {
        expect(parseNumberEnv("-1", 1, "X")).toBe(-1);
    });

    test("accepts scientific notation", () => {
        expect(parseNumberEnv("1e-2", 1, "X")).toBe(0.01);
    });

    test("tolerates surrounding whitespace from a .env file", () => {
        expect(parseNumberEnv(" 0.9 ", 0.85, "X")).toBe(0.9);
    });
});
