import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ redis: vi.fn(), database: vi.fn(), eval: vi.fn() }));
vi.mock("../../src/lib/queue.js", () => ({ getRedis: mocks.redis }));
vi.mock("@actorconsole/db", () => ({ checkDatabaseRateLimit: mocks.database }));
import { checkRateLimit } from "../../src/lib/rate-limit.js";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());
const options = { max: 10, windowMs: 60_000 };
it("uses shared database limits when Redis is disabled in production", async () => {
  mocks.redis.mockReturnValue(null);
  mocks.database.mockResolvedValue({ allowed: true, remaining: 9, retryAfterMs: 0 });
  expect(await checkRateLimit("login:fixture", options)).toMatchObject({
    allowed: true,
    remaining: 9,
  });
  expect(mocks.database).toHaveBeenCalledWith("login:fixture", options);
});
it("fails closed on database errors", async () => {
  mocks.redis.mockReturnValue(null);
  mocks.database.mockRejectedValue(new Error("offline"));
  expect(await checkRateLimit("login:fixture", options)).toMatchObject({ allowed: false });
});
it("does not switch production limit stores when configured Redis is unavailable", async () => {
  mocks.redis.mockReturnValue({ eval: mocks.eval });
  mocks.eval.mockRejectedValue(new Error("offline"));
  expect(await checkRateLimit("login:fixture", options)).toMatchObject({ allowed: false });
  expect(mocks.database).not.toHaveBeenCalled();
});
