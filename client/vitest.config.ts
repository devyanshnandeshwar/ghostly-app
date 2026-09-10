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
            include: ["src/**/*.test.{ts,tsx}"],
            coverage: {
                provider: "v8",
                reporter: ["text", "lcov"],
                // `include` is the point. Without it only files a test imports
                // are instrumented, so an entirely untested module is invisible
                // and the headline percentage flatters the suite badly: this
                // project reads 97% that way and 16.6% measured properly.
                //
                // Vitest 5 removed the old `all` flag -- naming the files here
                // is how you get the same behaviour now.
                include: ["src/**/*.{ts,tsx}"],
                exclude: [
                    "src/**/*.test.{ts,tsx}",
                    "src/test/**",
                    // shadcn primitives, vendored rather than authored here.
                    "src/components/ui/**",
                    "src/main.tsx",
                    "src/vite-env.d.ts"
                ],
                // A RATCHET, not a target.
                //
                // Real client coverage with `all` enabled is ~16% -- the suite
                // covers pure logic (crypto, countdown, auth, socketService,
                // apiError, cameraError) thoroughly and the components barely
                // at all. Setting the 80% standard here would fail CI on the
                // first run and teach everyone to bypass it.
                //
                // So these sit just under the current figures: they cannot be
                // met by deleting tests, and they must be raised as component
                // coverage lands. The server, measured the same way, is at 83%.
                thresholds: {
                    lines: 16,
                    functions: 19,
                    statements: 16,
                    branches: 10
                }
            }
        }
    })
);
