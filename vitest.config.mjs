import { defineConfig } from "vitest/config";

/**
 * Each package keeps its own test configuration.
 *
 * Run from the repo root:    pnpm test
 * Run for a single package:  pnpm --filter @actorconsole/shared test
 */
export default defineConfig({
  test: {
    projects: [
      "./packages/shared",
      "./packages/ai",
      "./packages/apify",
      "./packages/db",
      "./packages/logo-catalog",
      "./apps/api",
      "./apps/chrome-extension",
      "./apps/mcp",
      "./apps/worker",
      "./apps/web",
    ],
  },
});
