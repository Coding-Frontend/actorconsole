import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../src/app.js";

const { profile, getClient } = vi.hoisted(() => ({ profile: vi.fn(), getClient: vi.fn() }));
vi.mock("@actorconsole/db", () => ({ db: { businessProfile: { findFirst: profile } } }));
vi.mock("@actorconsole/apify", () => ({ getUserApifyClient: getClient }));
import { onErrorHandler } from "../../src/middleware/error.js";
import { requireWorkspaceOperationalAccess } from "../../src/middleware/workspace-access.js";

function buildApp(plan: "FREE" | "PRO" = "FREE", workspaceId = "w1", mcp = false) {
  const app = new Hono<AppEnv>();
  app.onError(onErrorHandler);
  app.use("*", async (c, next) => {
    c.set("session", {
      userId: "u1",
      email: "builder@example.com",
      plan,
      businessProfileId: workspaceId,
      ...(mcp ? { apiKeyId: "k1", apiKeyScopes: ["mcp", "actors:read"] } : {}),
    });
    await next();
  });
  for (const prefix of ["/actors/*", "/bulk-publishing/*", "/account/*", "/apify/*"])
    app.use(prefix, requireWorkspaceOperationalAccess);
  app.all("*", (c) => c.json({ ok: true }));
  return app;
}

describe("workspace operational API access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: 51,
      apifyMonthlyUsers: 100,
      planUsageCheckedAt: new Date(),
    });
  });
  it.each([
    "/actors",
    "/actors/a1",
    "/actors/a1/usage",
    "/bulk-publishing/queue",
    "/account/dashboard-summary",
    "/apify/operations",
  ])("blocks direct reads from %s", async (path) => {
    const response = await buildApp().request(path);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("plan_usage_limit_exceeded");
  });
  it("blocks operational writes and MCP actor reads", async () => {
    expect((await buildApp().request("/actors/a1/publish", { method: "POST" })).status).toBe(403);
    expect((await buildApp("FREE", "w1", true).request("/actors/a1")).status).toBe(403);
  });
  it.each([
    "/actors/plan-usage",
    "/account/workspace-access",
    "/account/api-key-actors",
    "/account/api-keys",
    "/apify/connect",
    "/keywords/search",
    "/mcp/info",
    "/billing/checkout",
  ])("allows setup and recovery at %s", async (path) => {
    expect((await buildApp().request(path)).status).toBe(200);
    expect(profile).not.toHaveBeenCalled();
  });
  it("allows exactly 50 actors and 500 users, but blocks the 501st user", async () => {
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: 50,
      apifyMonthlyUsers: 500,
      planUsageCheckedAt: new Date(),
    });
    expect((await buildApp().request("/actors")).status).toBe(200);
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: 1,
      apifyMonthlyUsers: 501,
      planUsageCheckedAt: new Date(),
    });
    expect((await buildApp().request("/actors")).status).toBe(403);
  });
  it("allows Pro at any usage level", async () => {
    expect((await buildApp("PRO").request("/actors")).status).toBe(200);
    expect(profile).not.toHaveBeenCalled();
  });
  it("evaluates each selected workspace separately", async () => {
    profile.mockImplementation(({ where }) =>
      Promise.resolve({
        plan: "FREE",
        apifyActorCount: where.id === "large" ? 51 : 3,
        apifyMonthlyUsers: 20,
        planUsageCheckedAt: new Date(),
      }),
    );
    expect((await buildApp("FREE", "large").request("/actors")).status).toBe(403);
    expect((await buildApp("FREE", "small").request("/actors")).status).toBe(200);
    expect(profile).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "small", userId: "u1" } }),
    );
  });
});
