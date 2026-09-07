import { describe, expect, test } from "bun:test";
import { MINIMUM_AGE_YEARS, isAdult, parseBirthDate } from "./age.policy";

// There was no age check anywhere on a product that pairs anonymous strangers
// one to one and lists "Underage" among its six report reasons -- which is an
// admission that minors were expected to arrive.

const at = (iso: string) => new Date(iso + "T12:00:00Z");

describe("isAdult", () => {
    test("accepts someone comfortably over the minimum", () => {
        expect(isAdult(at("1990-01-01"), at("2026-09-08"))).toBe(true);
    });

    test("rejects someone comfortably under it", () => {
        expect(isAdult(at("2015-01-01"), at("2026-09-08"))).toBe(false);
    });

    test("accepts someone exactly on their birthday", () => {
        const birth = at("2008-09-08");
        expect(isAdult(birth, at("2026-09-08"))).toBe(true);
    });

    test("rejects someone one day short", () => {
        // The boundary is the whole point of the check; an off-by-one here
        // admits people the gate exists to keep out.
        expect(isAdult(at("2008-09-09"), at("2026-09-08"))).toBe(false);
    });

    test("handles a 29 February birth date in a non-leap year", () => {
        expect(isAdult(at("2008-02-29"), at("2026-03-01"))).toBe(true);
    });

    test("rejects a future birth date", () => {
        expect(isAdult(at("2030-01-01"), at("2026-09-08"))).toBe(false);
    });

    test("states a minimum age that is actually adult", () => {
        expect(MINIMUM_AGE_YEARS).toBeGreaterThanOrEqual(18);
    });
});

describe("parseBirthDate", () => {
    test("accepts an ISO date", () => {
        expect(parseBirthDate("1990-06-15")?.getUTCFullYear()).toBe(1990);
    });

    test("rejects anything that is not a usable date", () => {
        expect(parseBirthDate("")).toBeNull();
        expect(parseBirthDate("not-a-date")).toBeNull();
        expect(parseBirthDate(null)).toBeNull();
        expect(parseBirthDate(12345 as unknown as string)).toBeNull();
        expect(parseBirthDate("1990-13-45")).toBeNull();
    });

    test("rejects an implausibly distant date rather than storing nonsense", () => {
        expect(parseBirthDate("1820-01-01")).toBeNull();
    });
});
