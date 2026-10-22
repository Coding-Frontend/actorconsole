import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      // Keep the release gate focused on security, data-integrity, and
      // infrastructure primitives. UI/HTML templates are covered by browser
      // smoke tests and are intentionally not part of this unit-test gate.
      include: [
        "src/crypto.ts",
        "src/webhook-verify.ts",
        "src/apify-helpers.ts",
        "src/logger.ts",
        "src/urls.ts",
        "src/plans.ts",
        "src/queue/retry-policies.ts",
        "src/totp.ts",
        "src/metrics.ts",
      ],
    },
  },
});
