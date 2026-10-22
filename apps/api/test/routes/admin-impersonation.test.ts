import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  createSession: vi.fn(),
  user: vi.fn(),
  createHandoff: vi.fn(),
  handoff: vi.fn(),
  claim: vi.fn(),
  updateHandoff: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({
  db: {
    session: { findUnique: mocks.session, create: mocks.createSession },
    user: { findUnique: mocks.user },
    impersonationSession: {
      create: mocks.createHandoff,
      findUnique: mocks.handoff,
      updateMany: mocks.claim,
      update: mocks.updateHandoff,
    },
    $transaction: mocks.transaction,
    auditLog: { create: mocks.audit },
  },
}));
import { adminRoutes } from "../../src/routes/admin.js";

function request(path: string, body?: unknown, headers = { authorization: "Bearer admin-token" }) {
  return new Hono()
    .onError(onErrorHandler)
    .route("/admin", adminRoutes)
    .request(`/admin${path}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
}
const target = { id: "user_1", role: "USER", suspendedAt: null, deletionScheduledFor: null };

describe("Admin mimic session authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      user: { id: "admin_1", email: "admin@example.com", role: "ADMIN", suspendedAt: null },
    });
    mocks.user.mockResolvedValue(target);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.createSession.mockResolvedValue({ id: "mimic_session" });
    mocks.handoff.mockResolvedValue({
      id: "handoff_1",
      adminId: "admin_1",
      targetUserId: "user_1",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      target,
    });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        session: { create: mocks.createSession },
        impersonationSession: { updateMany: mocks.claim, update: mocks.updateHandoff },
      }),
    );
  });
  it("lets an ADMIN start an audited session for an active user", async () => {
    const response = await request("/users/user_1/impersonate");
    expect(response.status).toBe(200);
    expect((await response.json()).data.token).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.createHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ adminId: "admin_1", targetUserId: "user_1" }),
      }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "user.impersonation.started" }),
      }),
    );
  });
  it("blocks service credentials from creating human sessions", async () => {
    vi.stubEnv("ADMIN_API_KEY", "service-key");
    const response = await request("/users/user_1/impersonate", {}, {
      "x-admin-api-key": "service-key",
    } as never);
    vi.unstubAllEnvs();
    expect(response.status).toBe(403);
    expect(mocks.createHandoff).not.toHaveBeenCalled();
  });
  it("blocks self impersonation", async () => {
    expect((await request("/users/admin_1/impersonate")).status).toBe(400);
  });
  it.each([
    { ...target, role: "ADMIN" },
    { ...target, suspendedAt: new Date() },
    { ...target, deletionScheduledFor: new Date() },
  ])("blocks an unavailable target %#", async (user) => {
    mocks.user.mockResolvedValue(user);
    expect((await request("/users/user_1/impersonate")).status).toBe(409);
    expect(mocks.createHandoff).not.toHaveBeenCalled();
  });
  it("atomically claims the one-time handoff and creates a target session", async () => {
    const response = await request("/impersonation/consume", { token: "a".repeat(64) });
    expect(response.status).toBe(200);
    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "handoff_1", revokedAt: null }),
      }),
    );
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user_1", impersonatedById: "admin_1" }),
      }),
    );
  });
  it("does not create a second session when a concurrent request already claimed the token", async () => {
    mocks.claim.mockResolvedValue({ count: 0 });
    expect((await request("/impersonation/consume", { token: "a".repeat(64) })).status).toBe(401);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
  it.each([
    { revokedAt: new Date() },
    { expiresAt: new Date(Date.now() - 60_000) },
    { adminId: "another_admin" },
    { target: { ...target, deletionScheduledFor: new Date() } },
  ])("rejects an invalid handoff %#", async (overrides) => {
    mocks.handoff.mockResolvedValue({
      id: "handoff_1",
      adminId: "admin_1",
      expiresAt: new Date(Date.now() + 60_000),
      target,
      ...overrides,
    });
    expect((await request("/impersonation/consume", { token: "a".repeat(64) })).status).toBe(401);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
