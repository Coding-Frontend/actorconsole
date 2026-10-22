import { defineWorkspace } from "vitest/config";

/**
 * Vitest workspace — discovers all `vitest.config.ts` files in the monorepo.
 * Each package can have its own config; this top-level config just glues them.
 *
 * Run from the repo root:    pnpm test
 * Run for a single package:  pnpm --filter @actorconsole/shared test
 */
export default defineWorkspace([
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
]);
