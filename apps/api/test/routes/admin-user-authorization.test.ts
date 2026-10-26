import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  session: { findUnique: vi.fn(), deleteMany: vi.fn() },
  audit: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({ db: {
  user: mocks.user, session: mocks.session, auditLog: { create: mocks.audit },
  $transaction: mocks.transaction,
} }));
import { adminRoutes } from "../../src/routes/admin.js";

const app = new Hono().onError(onErrorHandler).route("/admin", adminRoutes);
function request(path: string, method: string, body?: unknown) {
  return app.request(`/admin/users/${path}`, {
    method, headers: { cookie: "authjs.session-token=admin-fixture", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function caller(role = "ADMIN") {
  mocks.session.findUnique.mockResolvedValue({
    expires: new Date(Date.now() + 60_000),
    user: { id: "admin-a", email: "admin@example.test", role, suspendedAt: null },
  });
}

describe("administrator user-management authority", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    caller();
    mocks.user.update.mockImplementation(async ({ data }) => ({ id: "target", ...data }));
    mocks.user.count.mockResolvedValue(2);
    mocks.session.deleteMany.mockResolvedValue({ count: 1 });
    mocks.audit.mockResolvedValue({});
    mocks.transaction.mockImplementation((operations) => Promise.all(operations));
  });

  it.each(["ADMIN", "SUPER_ADMIN"])("prevents an ADMIN from changing %s suspension via every route", async (role) => {
    mocks.user.findUnique.mockResolvedValue({ id: "target", role, suspendedAt: null });
    for (const [path, method, body] of [
      ["target", "PATCH", { suspendedAt: new Date().toISOString() }],
      ["target", "PATCH", { suspendedAt: null }],
      ["target/suspend", "POST", undefined],
      ["target/reinstate", "POST", undefined],
    ] as const) {
      const response = await request(path, method, body);
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("super_admin_required");
    }
    expect(mocks.user.update).not.toHaveBeenCalled();
    expect(mocks.session.deleteMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "SUPER_ADMIN"])("allows %s to suspend ordinary users and revokes their sessions", async (role) => {
    caller(role);
    mocks.user.findUnique.mockResolvedValue({ id: "target", role: "USER", suspendedAt: null });
    expect((await request("target", "PATCH", { suspendedAt: new Date().toISOString() })).status).toBe(200);
    expect(mocks.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "target" },
    });
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("allows a SUPER_ADMIN to reinstate a privileged account", async () => {
    caller("SUPER_ADMIN");
    mocks.user.findUnique.mockResolvedValue({ id: "target", role: "ADMIN", suspendedAt: new Date() });
    expect((await request("target/reinstate", "POST")).status).toBe(200);
    expect(mocks.user.update).toHaveBeenCalledWith({ where: { id: "target" }, data: { suspendedAt: null, bannedReason: null } });
  });

  it("revokes sessions on the dedicated suspension path", async () => {
    mocks.user.findUnique.mockResolvedValue({ id: "target", role: "USER", suspendedAt: null });
    expect((await request("target/suspend", "POST")).status).toBe(200);
    expect(mocks.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "target" },
    });
  });

  it("keeps ordinary profile edits available without revoking sessions", async () => {
    mocks.user.findUnique.mockResolvedValue({ id: "target", role: "SUPER_ADMIN", suspendedAt: null });
    expect((await request("target", "PATCH", { name: "Updated name" })).status).toBe(200);
    expect(mocks.session.deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    ["admin-a", "PATCH", { suspendedAt: new Date().toISOString() }],
    ["admin-a/suspend", "POST", undefined],
  ] as const)("preserves self-lockout protection on %s", async (path, method, body) => {
    caller("SUPER_ADMIN");
    mocks.user.findUnique.mockResolvedValue({ id: "admin-a", role: "SUPER_ADMIN", suspendedAt: null });
    expect((await request(path, method, body)).status).toBe(400);
    expect(mocks.user.update).not.toHaveBeenCalled();
  });
});
