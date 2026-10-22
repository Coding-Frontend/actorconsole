import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  for (const [key, value] of Object.entries({
    NODE_ENV: "production",
    DATABASE_URL: "mysql://fixture@localhost:3306/fixture",
    REDIS_URL: "redis://localhost:6379",
    AUTH_URL: "https://app.example.org",
    CORS_ORIGINS: "https://app.example.org",
    SUPPORT_EMAIL: "support@example.org",
    ADMIN_API_KEY: "a".repeat(64),
    APP_ENCRYPTION_KEY: "b".repeat(64),
    AUTH_SECRET: "c".repeat(64),
  })) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

it("rejects production startup without the authentication-code signing secret", async () => {
  vi.stubEnv("AUTH_SECRET", "");
  await expect(import("../../src/config/env.js")).rejects.toThrow("AUTH_SECRET");
});
it("accepts an independent production installation with all core secrets", async () => {
  const { apiEnv } = await import("../../src/config/env.js");
  expect(apiEnv.AUTH_URL).toBe("https://app.example.org");
});
