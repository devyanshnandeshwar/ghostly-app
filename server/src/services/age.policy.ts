/**
 * The age gate.
 *
 * This is self-declared and therefore trivially bypassable by anyone willing to
 * type a different year. That is not an argument against having it: a declared
 * gate establishes the terms of use, gives the report flow something to act
 * against, and is the minimum a product pairing anonymous strangers one to one
 * can defend. It is not identity verification and must not be described as one.
 */

export const MINIMUM_AGE_YEARS = 18;

/** Nobody alive is older than this; a date beyond it is a typo or a probe. */
const MAX_PLAUSIBLE_AGE_YEARS = 120;

/**
 * Whole years elapsed, compared against the minimum.
 *
 * Done on calendar parts rather than by dividing milliseconds: a year is not a
 * fixed number of milliseconds, and the boundary case is exactly what this
 * function exists to get right.
 */
export function isAdult(birthDate: Date, now: Date = new Date()): boolean {
    if (Number.isNaN(birthDate.getTime())) return false;
    if (birthDate.getTime() > now.getTime()) return false;

    let age = now.getUTCFullYear() - birthDate.getUTCFullYear();

    const monthDelta = now.getUTCMonth() - birthDate.getUTCMonth();
    const dayDelta = now.getUTCDate() - birthDate.getUTCDate();

    // Birthday has not come round yet this year.
    if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
        age -= 1;
    }

    return age >= MINIMUM_AGE_YEARS;
}

/** Parses a client-supplied date, rejecting anything unusable. */
export function parseBirthDate(value: unknown): Date | null {
    if (typeof value !== "string" || !value.trim()) return null;

    // Anchored to midday UTC so a timezone offset cannot shift the calendar day
    // and move someone across the boundary.
    const parsed = new Date(`${value.trim().slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return null;

    const now = new Date();
    if (parsed.getTime() > now.getTime()) return null;

    const oldest = new Date(now);
    oldest.setUTCFullYear(oldest.getUTCFullYear() - MAX_PLAUSIBLE_AGE_YEARS);
    if (parsed.getTime() < oldest.getTime()) return null;

    return parsed;
}
