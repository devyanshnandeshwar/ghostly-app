import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

/**
 * Test config, kept out of vite.config.ts on purpose.
 *
 * `bun run build` is `tsc -b && vite build`, and tsconfig.node.json typechecks
 * vite.config.ts against Vite's own UserConfig -- which has no `test` key. A
 * test block there fails the production build.
 *
 * Merging means tests still inherit the "@" alias and, more importantly, Vite's
 * import.meta.env transform. Four modules read import.meta.env at module scope
 * (services/client.ts, lib/genderClassifier.ts, hooks/useFaceFraming.ts,
 * context/SocketContext.tsx), which is why this is Vitest rather than the bun
 * runner the server uses.
 */
export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            environment: "happy-dom",
            setupFiles: ["./src/test/setup.ts"],
            // Explicit imports from "vitest" in every test file rather than
            // globals: tsconfig.app.json sets noUnusedLocals and
            // verbatimModuleSyntax, and eslint lints test files too, so globals
            // would need extra config for no benefit.
            globals: false,
            include: ["src/**/*.test.{ts,tsx}"]
        }
    })
);
