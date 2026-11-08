#!/usr/bin/env node
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function oklchToSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((v) => {
    const enc = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, enc));
  });
}

function relativeLuminance([r, g, b]) {
  const f = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

function palette(selector) {
  const block = css.split(selector + " {")[1]?.split("\n}")[0];
  assert.ok(block, "Missing palette: " + selector);
  const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+): oklch\(([^)]+)\);/g)].map(([, name, value]) => {
    const [color, alpha = "1"] = value.split(" / ");
    const [l, c, h] = color.split(" ").map(Number);
    return [name, { rgb: oklchToSrgb(l, c, h), alpha: parseFloat(alpha) / (alpha.endsWith("%") ? 100 : 1) }];
  }));
  const result = Object.fromEntries(Object.entries(tokens).map(([name, { rgb, alpha }]) =>
    [name, rgb.map((channel, i) => channel * alpha + tokens.card.rgb[i] * (1 - alpha))]
  ));
  result["primary-tint"] = result.primary.map((channel, i) => channel * 0.1 + result.card[i] * 0.9);
  result["primary-hover"] = result.primary.map((channel, i) => channel * 0.95 + result.card[i] * 0.05);
  return result;
}

assert.equal(contrast([1, 1, 1], [0, 0, 0]), 21);
const light = palette(":root");
const dark = palette(".dark");

// [foreground, background, minimum ratio]
const pairs = [
  ["foreground", "background", 4.5],
  ["foreground", "card", 4.5],
  ["foreground", "secondary", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["muted-foreground", "secondary", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["primary", "background", 4.5],
  ["primary", "card", 4.5],
  ["destructive-foreground", "destructive", 4.5],
  ["destructive", "background", 4.5],
  ["success", "background", 4.5],
  ["success", "card", 4.5],
  ["input", "card", 3],
  ["input", "background", 3],
  ["ring", "card", 3],
  ["foreground", "primary-tint", 4.5],
  ["primary-foreground", "primary-hover", 4.5],
];

let failed = 0;
for (const [mode, tokens] of [
  ["light", light],
  ["dark", dark],
]) {
  console.log(`\n${mode}`);
  for (const [fg, bg, min] of pairs) {
    const ratio = contrast(tokens[fg], tokens[bg]);
    const ok = ratio >= min;
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${`${fg} on ${bg}`.padEnd(40)} ${ratio.toFixed(2)} (min ${min})`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} pair(s) below WCAG AA.`);
  process.exit(1);
}
console.log("\nAll pairs pass WCAG AA.");
