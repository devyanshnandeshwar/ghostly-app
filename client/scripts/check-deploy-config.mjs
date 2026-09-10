#!/usr/bin/env bun
/**
 * Fails the build on deploy config that would ship a broken app.
 *
 * Both checks guard the same failure shape: the SPA builds, deploys, loads, and
 * then cannot reach its own API -- with nothing in the build output saying so.
 * The browser reports a CSP violation or a CORS error at runtime, to a user who
 * just sees a page that does nothing.
 *
 * Runs only when building for deployment (CI or Vercel), so local `bun run
 * build` stays usable with placeholder config.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const vercelConfigPath = resolve(here, "..", "vercel.json");

const isDeployBuild = process.env.VERCEL === "1" || process.env.CI === "true";

const problems = [];

// 1. The CSP placeholder.
const vercelConfig = readFileSync(vercelConfigPath, "utf8");
if (vercelConfig.includes("REPLACE-ME")) {
    problems.push(
        "vercel.json still contains REPLACE-ME in the Content-Security-Policy.\n" +
            "     connect-src must name the real API origin, or the browser blocks\n" +
            "     every API call and the WebSocket handshake."
    );
}

// 2. The build-time API URLs.
//
// Vite inlines these at build. Unset, the client falls back to a same-origin
// path -- which on Vercel serves no API -- and the only fix is a REBUILD, not a
// redeploy, because the wrong value is already baked into the bundle.
for (const key of ["VITE_API_URL", "VITE_SOCKET_URL"]) {
    const value = process.env[key];

    if (!value) {
        problems.push(
            `${key} is not set.\n` +
                "     Vite inlines this at build time; unset, the client falls back to\n" +
                "     its own origin, which serves no API. Set it in the Vercel project."
        );
        continue;
    }

    if (/localhost|127\.0\.0\.1/i.test(value)) {
        problems.push(`${key} points at localhost (${value}), which no visitor can reach.`);
    }
}

if (!isDeployBuild) {
    if (problems.length > 0) {
        console.warn(
            `\n[deploy-config] ${problems.length} issue(s) would fail a deploy build:\n` +
                problems.map((p) => `  - ${p}`).join("\n") +
                "\n  (not failing a local build)\n"
        );
    }
    process.exit(0);
}

if (problems.length > 0) {
    console.error(
        `\n[deploy-config] Refusing to build for deployment:\n` +
            problems.map((p) => `  - ${p}`).join("\n") +
            "\n"
    );
    process.exit(1);
}

console.log("[deploy-config] OK");
