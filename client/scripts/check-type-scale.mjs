#!/usr/bin/env node
/*
 * Checks every step of the type scale in src/index.css against Geist's
 * vertical metrics. Unlike check-contrast.mjs this reads the tokens straight
 * from the stylesheet, so there is nothing to keep in sync by hand.
 *
 * Two rules, both explained above the scale in index.css:
 *   1. Every line height is a multiple of the 4px grid.
 *   2. The cap line sits within 0.3px of a whole pixel inside the line box.
 *
 * Run it with: bun scripts/check-type-scale.mjs
 */
import { readFileSync } from "node:fs";

// Read from the OS/2 table of the shipped woff2 (Geist and Geist Mono match):
// unitsPerEm 1000, ascent 1005, descent 295, cap height 710.
const ASCENT = 1.005;
const DESCENT = 0.295;
const CAP_HEIGHT = 0.71;

const ROOT_PX = 16;
const GRID_PX = 4;
const PIXEL_TOLERANCE = 0.3;

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const tokens = new Map(
  [...css.matchAll(/--text-([\w-]+?)(--line-height)?:\s*([\d.]+)rem;/g)].map(
    ([, name, isLineHeight, rem]) => [`${name}${isLineHeight ?? ""}`, Number(rem) * ROOT_PX]
  )
);

const sizes = [...tokens.keys()].filter((key) => !key.endsWith("--line-height"));
if (sizes.length === 0) {
  console.error("No --text-* tokens found in src/index.css");
  process.exit(1);
}

const distanceToWholePixel = (px) => Math.abs(px - Math.round(px));

let failed = 0;
for (const name of sizes) {
  const size = tokens.get(name);
  const lineHeight = tokens.get(`${name}--line-height`);
  if (lineHeight === undefined) {
    console.log(`FAIL  ${name.padEnd(4)} has no --line-height paired with it`);
    failed++;
    continue;
  }

  // CSS splits the leading evenly above and below the font's content area.
  const halfLeading = (lineHeight - (ASCENT + DESCENT) * size) / 2;
  const baseline = halfLeading + ASCENT * size;
  const capLine = baseline - CAP_HEIGHT * size;

  const onGrid = lineHeight % GRID_PX === 0;
  const capDrift = distanceToWholePixel(capLine);
  const ok = onGrid && capDrift <= PIXEL_TOLERANCE;
  if (!ok) failed++;

  console.log(
    `${ok ? "ok  " : "FAIL"}  ${name.padEnd(4)} ${String(size).padStart(5)}/${lineHeight}px` +
      `  cap ${(CAP_HEIGHT * size).toFixed(2)}px at ${capLine.toFixed(2)}` +
      `  drift ${capDrift.toFixed(2)}px${onGrid ? "" : "  line height off the 4px grid"}`
  );
}

if (failed) {
  console.error(`\n${failed} size(s) off the grid`);
  process.exit(1);
}
console.log(`\nAll ${sizes.length} sizes sit on the grid`);
