import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    businessProfile: { findFirst: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

vi.mock("@actorconsole/db", () => ({ db: mockDb }));
vi.mock("../../src/lib/plan-access.js", () => ({
  assertPlanFeature: vi.fn(),
  assertFeatureEnabled: vi.fn(),
}));

import { mcpProxyRoutes } from "../../src/routes/mcp.js";

function buildApp(scopes = ["read", "mcp", "workspace:read", "actors:read"]) {
  const app = new Hono();
  app.onError(onErrorHandler);
  app.use("*", async (c: any, next) => {
    c.set("session", {
      userId: "user_a",
      email: "a@example.com",
      plan: "PRO",
      businessProfileId: "workspace_a",
      authMethod: "api-key",
      apiKeyId: "key_a",
      apiKeyScopes: scopes,
      apiKeyActorIds: ["owner~allowed"],
    });
    await next();
  });
  app.route("/mcp", mcpProxyRoutes);
  return app;
}

describe("MCP capability routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.businessProfile.findFirst.mockResolvedValue({
      id: "workspace_a",
      name: "Workspace A",
      slug: "workspace-a",
      plan: "PRO",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-26T00:00:00.000Z"),
      apifyTokens: [
        {
          apifyUserId: "apify_a",
          apifyUsername: "owner",
          apiTokenStatus: "VALID",
          uiTokenStatus: "VALID",
          cookiesStatus: "NOT_CONFIGURED",
          validatedAt: new Date("2026-08-26T00:00:00.000Z"),
        },
      ],
    });
    mockDb.auditLog.findMany.mockResolvedValue([]);
  });

  it("reports only tools allowed by the credential capabilities", async () => {
    const response = await buildApp().request("/mcp/info");
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data.tools).toContain("list_actors");
    expect(data.tools).toContain("get_mcp_capabilities");
    expect(data.tools).not.toContain("apply_actor_changes");
    expect(data.tools).not.toContain("run_publishing_schedule");
    expect(data.resources).toEqual([
      "actorconsole://workspace",
      "actorconsole://actors",
      "actorconsole://actors/{actorId}",
    ]);
  });

  it("requires both publishing and Actor write permissions for Store status changes", async () => {
    const publishingOnly = await buildApp(["mcp", "publishing:write"]).request("/mcp/info");
    expect((await publishingOnly.json()).data.tools).not.toContain("change_actor_store_status");

    const withActorWrite = await buildApp(["mcp", "publishing:write", "actors:write"]).request(
      "/mcp/info",
    );
    expect((await withActorWrite.json()).data.tools).toContain("change_actor_store_status");
  });

  it("offers publishing preparation only when the credential can read Actors", async () => {
    const publishingOnly = await buildApp(["mcp", "publishing:write"]).request("/mcp/info");
    expect((await publishingOnly.json()).data.prompts).not.toContain("prepare_publishing_schedule");

    const withActorRead = await buildApp(["mcp", "publishing:write", "actors:read"]).request(
      "/mcp/info",
    );
    expect((await withActorRead.json()).data.prompts).toContain("prepare_publishing_schedule");
  });

  it("loads only the workspace permanently bound to the key", async () => {
    const response = await buildApp().request("/mcp/workspace");
    expect(response.status).toBe(200);
    expect(mockDb.businessProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "workspace_a", userId: "user_a" } }),
    );
    const data = (await response.json()).data;
    expect(data.workspace).toMatchObject({
      id: "workspace_a",
      apifyConnection: { connected: true, username: "owner", apiTokenStatus: "VALID" },
    });
    expect(data.actorScope).toEqual(["owner~allowed"]);
  });

  it("denies workspace metadata when workspace:read is absent", async () => {
    const response = await buildApp(["read", "mcp", "actors:read"]).request("/mcp/workspace");
    expect(response.status).toBe(403);
    expect(mockDb.businessProfile.findFirst).not.toHaveBeenCalled();
  });
});
