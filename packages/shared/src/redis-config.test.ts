import { describe, expect, it } from "vitest";
import { isRedisEnabled } from "./redis-config";

describe("Redis backend selection", () => {
  it("keeps URL-based behavior for existing installations", () => {
    expect(isRedisEnabled({ REDIS_URL: "redis://localhost:6379" })).toBe(true);
    expect(isRedisEnabled({})).toBe(false);
    expect(() => isRedisEnabled({ NODE_ENV: "production" })).toThrow("REDIS_URL");
  });
  it("explicitly disables every Redis client even when a URL is configured", () => {
    expect(isRedisEnabled({ REDIS_ENABLED: "false", REDIS_URL: "redis://unreachable:6379" })).toBe(
      false,
    );
    expect(isRedisEnabled({ REDIS_ENABLED: " false " })).toBe(false);
  });
  it("requires a URL when enabled and rejects typos instead of silently switching backends", () => {
    expect(() => isRedisEnabled({ REDIS_ENABLED: "true" })).toThrow("REDIS_URL");
    expect(() => isRedisEnabled({ REDIS_ENABLED: "flase" })).toThrow("REDIS_ENABLED");
    expect(isRedisEnabled({ REDIS_ENABLED: "true", REDIS_URL: "redis://localhost:6379" })).toBe(
      true,
    );
  });
});
