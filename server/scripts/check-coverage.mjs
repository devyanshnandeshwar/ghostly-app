#!/usr/bin/env bun
/**
 * Enforces an aggregate coverage floor.
 *
 * Not bunfig's coverageThreshold: as a scalar it gates per-file and fails on
 * files with no tests at all; as a table it did not gate in this version --
 * demanding 99% still exited 0. A threshold that does not fail when it should
 * teaches you to trust a number that means nothing, so this parses the summary
 * and decides explicitly.
 *
 * Usage: bun test --coverage 2>&1 | bun scripts/check-coverage.mjs
 */

/**
 * Floors, honestly set.
 *
 * Measured with test files excluded, the suite is at 78.63% functions and
 * 82.42% lines. Lines clears the 80% standard; functions does not, and pretending
 * otherwise would mean either counting test files as covered code (which is how
 * the number read 81% before) or setting a gate that never fires.
 *
 * The gap is nine files with ZERO function coverage, all of which touch mongoose
 * and none of which have a test seam yet:
 *
 *   controllers/{admin,profile,reports,verify}.controller.ts
 *   services/{audit,presence,report,session,verify}.service.ts
 *
 * Raise FUNCTIONS to 80 as those land. Until then this is a ratchet: it cannot
 * be met by deleting tests, and it fails the moment coverage slips.
 */
const MIN_FUNCTIONS = 78;
const MIN_LINES = 80;

const input = await new Response(Bun.stdin.stream()).text();
process.stdout.write(input);

// The summary row bun prints last: "All files | 81.23 | 83.58 |"
const row = input.split("\n").find((line) => line.trimStart().startsWith("All files"));

if (!row) {
    console.error(
        "\n[coverage] Could not find the summary row in bun's output.\n" +
            "  Refusing to pass a check that did not actually measure anything."
    );
    process.exit(1);
}

const [functions, lines] = row
    .split("|")
    .slice(1, 3)
    .map((cell) => Number.parseFloat(cell.trim()));

if (!Number.isFinite(functions) || !Number.isFinite(lines)) {
    console.error(`\n[coverage] Could not parse the summary row: ${row.trim()}`);
    process.exit(1);
}

const failures = [];
if (functions < MIN_FUNCTIONS) failures.push(`functions ${functions}% < ${MIN_FUNCTIONS}%`);
if (lines < MIN_LINES) failures.push(`lines ${lines}% < ${MIN_LINES}%`);

if (failures.length > 0) {
    console.error(`\n[coverage] Below floor: ${failures.join(", ")}`);
    process.exit(1);
}

console.log(`\n[coverage] OK — functions ${functions}%, lines ${lines}%`);
