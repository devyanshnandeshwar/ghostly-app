#!/usr/bin/env node
/*
 * Checks every foreground/background pair in the palette against WCAG AA.
 * The values here mirror the custom properties in src/index.css; if you change
 * a token there, change it here and re-run: node scripts/check-contrast.mjs
 */

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

const light = {
  background: [0.985, 0.003, 250],
  foreground: [0.21, 0.02, 265],
  card: [1, 0, 0],
  primary: [0.52, 0.115, 215],
  "primary-foreground": [1, 0, 0],
  secondary: [0.955, 0.006, 250],
  "muted-foreground": [0.5, 0.02, 260],
  destructive: [0.52, 0.2, 25],
  "destructive-foreground": [1, 0, 0],
  success: [0.52, 0.13, 155],
};

const dark = {
  background: [0.165, 0.014, 265],
  foreground: [0.945, 0.005, 250],
  card: [0.205, 0.015, 265],
  primary: [0.8, 0.115, 205],
  "primary-foreground": [0.2, 0.03, 240],
  secondary: [0.27, 0.016, 262],
  "muted-foreground": [0.7, 0.018, 258],
  destructive: [0.7, 0.17, 22],
  "destructive-foreground": [0.18, 0.04, 25],
  success: [0.78, 0.14, 160],
};

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
];

let failed = 0;
for (const [mode, tokens] of [
  ["light", light],
  ["dark", dark],
]) {
  console.log(`\n${mode}`);
  for (const [fg, bg, min] of pairs) {
    const ratio = contrast(oklchToSrgb(...tokens[fg]), oklchToSrgb(...tokens[bg]));
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
