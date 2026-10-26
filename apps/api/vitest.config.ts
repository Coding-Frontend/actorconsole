import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: [
        "src/lib/cache.ts",
        "src/lib/public-cache.ts",
        "src/lib/query.ts",
        "src/lib/user-audit.ts",
        "src/middleware/auth.ts",
        "src/middleware/api-key-scope.ts",
        "src/middleware/error.ts",
        "src/routes/announcements.ts",
        "src/routes/blog.ts",
        "src/routes/changelog.ts",
        "src/routes/contact.ts",
        "src/routes/faq.ts",
        "src/routes/health.ts",
        "src/routes/keywords.ts",
        "src/routes/metrics.ts",
        "src/routes/newsletter.ts",
        "src/routes/openapi.ts",
        "src/routes/payment-gateways.ts",
        "src/routes/policies.ts",
        "src/routes/status.ts",
        "src/routes/tickets.ts",
      ],
    },
  },
});
