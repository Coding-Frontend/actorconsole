import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUniqueSession = vi.fn();
const mockFindUniqueApiKey = vi.fn();
const mockUpdateApiKey = vi.fn();
const mockUpsertUsageRecord = vi.fn();
const mockCreateAuditLog = vi.fn();
const mockFindAdmin = vi.fn();
const mockDeleteSession = vi.fn();

vi.mock("@actorconsole/db", () => ({
  db: {
    session: {
      findUnique: (...args: unknown[]) => mockFindUniqueSession(...args),
      delete: (...args: unknown[]) => mockDeleteSession(...args),
    },
    user: { findUnique: (...args: unknown[]) => mockFindAdmin(...args) },
    apiKey: {
      findUnique: (...args: unknown[]) => mockFindUniqueApiKey(...args),
      update: (...args: unknown[]) => mockUpdateApiKey(...args),
    },
    usageRecord: {
      upsert: (...args: unknown[]) => mockUpsertUsageRecord(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mockCreateAuditLog(...args),
    },
  },
}));

vi.mock("../../src/lib/analytics.js", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@actorconsole/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@actorconsole/shared")>();
  return {
    ...actual,
    getLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
  };
});

import { requireAuth } from "../../src/middleware/auth.js";

function buildApp() {
  const app = new Hono();
  app.use("*", requireAuth());
  app.get("/protected", (c) =>
    c.json({
      ok: true,
      data: {
        userId: c.get("session").userId,
        businessProfileId: c.get("session").businessProfileId,
      },
    }),
  );
  return app;
}

describe("requireAuth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsertUsageRecord.mockResolvedValue({});
    mockCreateAuditLog.mockResolvedValue({});
    mockDeleteSession.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session token is provided", async () => {
    const res = await buildApp().request("/protected");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("unauthenticated");
  });
  it.each([null, { role: "USER" }, { role: "ADMIN", suspendedAt: new Date() },
    { role: "SUPER_ADMIN", deletionScheduledFor: new Date() }])("revalidates the live initiator before using an impersonated session (%j)", async (admin) => {
    mockFindUniqueSession.mockResolvedValueOnce({ id: "derived", expires: new Date(Date.now() + 60_000),
      impersonatedById: "admin", impersonationExpiresAt: new Date(Date.now() + 60_000),
      user: { id: "victim", email: "owner@example.test", plan: "PRO" } });
    mockFindAdmin.mockResolvedValueOnce(admin);
    const response = await buildApp().request("/protected", { headers: { cookie: "authjs.session-token=derived-token" } });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("impersonation_revoked");
    expect(mockDeleteSession).toHaveBeenCalledWith({ where: { id: "derived" } });
  });
  it("allows an unexpired derived session while its initiator is still an active administrator", async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ expires: new Date(Date.now() + 60_000),
      impersonatedById: "admin", impersonationExpiresAt: new Date(Date.now() + 60_000),
      user: { id: "victim", email: "owner@example.test", plan: "PRO" } });
    mockFindAdmin.mockResolvedValueOnce({ role: "ADMIN", suspendedAt: null, deletionScheduledFor: null });
    expect((await buildApp().request("/protected", { headers: { cookie: "authjs.session-token=derived-token" } })).status).toBe(200);
  });

  it("returns 401 when session token is invalid (no session in DB)", async () => {
    mockFindUniqueSession.mockResolvedValueOnce(null);

    const res = await buildApp().request("/protected", {
      headers: { cookie: "authjs.session-token=invalid-token" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toContain("Session");
  });

  it("returns 401 when session is expired", async () => {
    mockFindUniqueSession.mockResolvedValueOnce({
      sessionToken: "expired-token",
      expires: new Date("2020-01-01"), // expired
      user: { id: "u1", email: "test@test.com", plan: "FREE" },
    });

    const res = await buildApp().request("/protected", {
      headers: { cookie: "authjs.session-token=expired-token" },
    });
    expect(res.status).toBe(401);
  });

  it("allows access with valid session token in cookie", async () => {
    mockFindUniqueSession.mockResolvedValueOnce({
      sessionToken: "valid-token",
      expires: new Date("2099-01-01"),
      user: { id: "u1", email: "test@test.com", plan: "PRO" },
    });

    const res = await buildApp().request("/protected", {
      headers: { cookie: "authjs.session-token=valid-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.userId).toBe("u1");
  });

  it("allows access with Bearer token in Authorization header", async () => {
    mockFindUniqueSession.mockResolvedValueOnce({
      sessionToken: "bearer-token",
      expires: new Date("2099-01-01"),
      user: { id: "u2", email: "api@test.com", plan: "PRO" },
    });

    const res = await buildApp().request("/protected", {
      headers: { authorization: "Bearer bearer-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.userId).toBe("u2");
  });

  it("supports __Secure-authjs.session-token cookie", async () => {
    mockFindUniqueSession.mockResolvedValueOnce({
      sessionToken: "secure-token",
      expires: new Date("2099-01-01"),
      user: { id: "u3", email: "secure@test.com", plan: "FREE" },
    });

    const res = await buildApp().request("/protected", {
      headers: { cookie: "__Secure-authjs.session-token=secure-token" },
    });
    expect(res.status).toBe(200);
  });

  it("allows access with a valid personal API key", async () => {
    mockFindUniqueApiKey.mockResolvedValueOnce({
      id: "key_1",
      userId: "u4",
      expiresAt: null,
      revokedAt: null,
      lastUsedAt: new Date(),
      scopes: ["read", "write", "mcp"],
      actorIds: [],
      businessProfile: { id: "workspace_4", userId: "u4", plan: "PRO" },
      user: { id: "u4", email: "mcp@test.com", plan: "PRO", suspendedAt: null },
    });
    const res = await buildApp().request("/protected", {
      headers: { authorization: `Bearer al_${"a".repeat(64)}` },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({
      userId: "u4",
      businessProfileId: "workspace_4",
    });
    expect(mockFindUniqueSession).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(mockUpsertUsageRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ userId: "u4", metric: "api_requests", quantity: 1 }),
          update: { quantity: { increment: 1 } },
        }),
      ),
    );
  });

  it("records MCP requests separately", async () => {
    mockFindUniqueApiKey.mockResolvedValueOnce({
      id: "key_mcp",
      userId: "u4",
      expiresAt: null,
      revokedAt: null,
      lastUsedAt: new Date(),
      scopes: ["mcp"],
      actorIds: [],
      businessProfile: { id: "workspace_4", userId: "u4", plan: "PRO" },
      user: { id: "u4", email: "mcp@test.com", plan: "PRO", suspendedAt: null },
    });
    const app = new Hono();
    app.use("*", requireAuth());
    app.get("/mcp/capabilities", (c) => c.json({ ok: true }));

    const res = await app.request("/mcp/capabilities", {
      headers: { authorization: `Bearer al_${"d".repeat(64)}` },
    });

    expect(res.status).toBe(200);
    await vi.waitFor(() =>
      expect(mockUpsertUsageRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ metric: "mcp_calls" }),
        }),
      ),
    );
    await vi.waitFor(() =>
      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "mcp.discovery", source: "mcp" }),
        }),
      ),
    );
  });

  it("does not repeat authentication for an existing trusted context session", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("session", {
        userId: "u-existing",
        email: "existing@example.com",
        plan: "PRO",
        authMethod: "session",
      });
      await next();
    });
    app.use("*", requireAuth());
    app.get("/protected", (c) => c.json({ ok: true, data: c.get("session") }));

    const res = await app.request("/protected");

    expect(res.status).toBe(200);
    expect(mockFindUniqueApiKey).not.toHaveBeenCalled();
    expect(mockFindUniqueSession).not.toHaveBeenCalled();
  });

  it("rejects an expired personal API key", async () => {
    mockFindUniqueApiKey.mockResolvedValueOnce({
      id: "key_2",
      userId: "u4",
      expiresAt: new Date("2020-01-01"),
      revokedAt: null,
      lastUsedAt: null,
      scopes: ["read"],
      actorIds: [],
      businessProfile: { id: "workspace_4", userId: "u4", plan: "PRO" },
      user: { id: "u4", email: "mcp@test.com", plan: "PRO", suspendedAt: null },
    });
    const res = await buildApp().request("/protected", {
      headers: { authorization: `Bearer al_${"b".repeat(64)}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a revoked personal API key", async () => {
    mockFindUniqueApiKey.mockResolvedValueOnce({
      id: "key_revoked",
      userId: "u4",
      expiresAt: null,
      revokedAt: new Date(),
      lastUsedAt: null,
      scopes: ["read"],
      actorIds: [],
      businessProfile: { id: "workspace_4", userId: "u4", plan: "PRO" },
      user: { id: "u4", email: "mcp@test.com", plan: "PRO", suspendedAt: null },
    });
    const res = await buildApp().request("/protected", {
      headers: { authorization: `Bearer al_${"c".repeat(64)}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a malformed personal API key without querying the database", async () => {
    const res = await buildApp().request("/protected", {
      headers: { authorization: "Bearer al_not-a-valid-key" },
    });
    expect(res.status).toBe(401);
    expect(mockFindUniqueApiKey).not.toHaveBeenCalled();
    expect(mockFindUniqueSession).not.toHaveBeenCalled();
  });
});
