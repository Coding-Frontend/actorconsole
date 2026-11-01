import { Hono } from "hono";
import { beforeEach, expect, it, vi } from "vitest";
const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock("../../src/lib/rate-limit.js", () => ({ checkRateLimit: limit }));
vi.mock("../../src/lib/client-ip.js", () => ({ resolveClientIp: () => "127.0.0.1" }));
import { publicCatalogRoutes } from "../../src/routes/public-catalog.js";

beforeEach(() => {
  vi.clearAllMocks();
  limit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 60_000 });
});
function app() {
  return new Hono().route("/", publicCatalogRoutes)
    .get("/account/workspace-access", (c) => c.json({ ok: true }))
    .post("/auth/local/verify-email", (c) => c.json({ ok: true }))
    .get("/public/sitemap/blog", (c) => c.json({ ok: true }));
}
it.each([
  ["/account/workspace-access", "GET"],
  ["/auth/local/verify-email", "POST"],
])("does not apply catalog limits to %s when mounted at the API root", async (url, method) => {
  expect((await app().request(url, { method })).status).toBe(200);
  expect(limit).not.toHaveBeenCalled();
});
it.each(["/public/catalog/summary", "/public/sitemap/blog", "/actors/public/owner/actor"])(
  "retains the public quota on %s", async (url) => {
    expect((await app().request(url)).status).toBe(429);
    expect(limit).toHaveBeenCalledWith("public-catalog:127.0.0.1", { windowMs: 60_000, max: 120 });
  },
);
