import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  workspace: vi.fn(),
  session: vi.fn(),
  deleteMany: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  fetch: vi.fn(),
  values: new Map<string, string>(),
}));
vi.mock("../../../src/lib/web-session.js", () => ({ auth: mocks.auth }));
vi.mock("../../../src/lib/http-context.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/lib/http-context.js")>(),
  requestCookies: async () => ({
    get: (name: string) => (mocks.values.has(name) ? { value: mocks.values.get(name) } : undefined),
  }),
}));
vi.mock("@actorconsole/db", () => ({
  db: {
    user: { findUnique: mocks.user },
    businessProfile: { findFirst: mocks.workspace },
    session: { findUnique: mocks.session, deleteMany: mocks.deleteMany },
    auditLog: { create: mocks.audit },
    $transaction: mocks.transaction,
  },
}));
import { POST as start } from "../../../src/routes/web-auth/impersonate.js";
import { POST as exit } from "../../../src/routes/web-auth/impersonate-exit.js";
import { getMimicStatus } from "../../../src/lib/impersonation.js";

function responseCookie(response: Response, name: string) {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(name + "="));
  if (!header) return undefined;
  const [pair, ...attributes] = header.split(";").map((value) => value.trim());
  const expires = attributes.find((value) => value.toLowerCase().startsWith("expires="));
  const maxAge = attributes.find((value) => value.toLowerCase().startsWith("max-age="));
  return { value: decodeURIComponent(pair.slice(name.length + 1)), expires: expires ? new Date(expires.slice(8)) : undefined, maxAge: maxAge ? Number(maxAge.slice(8)) : undefined };
}
function request(body: unknown) {
  return new Request("http://localhost/api/admin/impersonate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const adminSession = {
  id: "admin_session",
  userId: "admin_1",
  expires: new Date(Date.now() + 86_400_000),
  impersonatedById: null,
  user: { role: "ADMIN", suspendedAt: null },
};

describe("Mimic user routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.values.clear();
    mocks.values.set("authjs.session-token", "original-token");
    mocks.values.set("actorconsole.business-profile", "admin-workspace");
    mocks.auth.mockResolvedValue({ user: { id: "admin_1" } });
    mocks.user.mockResolvedValue({ role: "ADMIN", suspendedAt: null });
    mocks.session.mockResolvedValue(adminSession);
    mocks.workspace.mockResolvedValue({ id: "workspace_1" });
    mocks.transaction.mockImplementation((operations) => Promise.all(operations));
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockResolvedValueOnce(Response.json({ ok: true, data: { token: "a".repeat(64) } }));
    mocks.fetch.mockResolvedValueOnce(
      Response.json({
        ok: true,
        data: {
          sessionToken: "target-token",
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
        },
      }),
    );
  });
  it("allows an admin to mimic a user and selects their workspace", async () => {
    const response = await start(
      request({
        userId: "user_1",
        workspaceId: "workspace_1",
        dashboardPath: "/dashboard/publishing/schedules",
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.redirectTo).toBe("/dashboard/publishing/schedules");
    expect(responseCookie(response, "authjs.session-token")?.value).toBe("target-token");
    expect(responseCookie(response, "actorconsole.original-session")?.value).toBe("original-token");
    expect(responseCookie(response, "actorconsole.original-workspace")?.value).toBe("admin-workspace");
    expect(responseCookie(response, "actorconsole.business-profile")?.value).toBe("workspace_1");
    expect(responseCookie(response, "actorconsole.original-session")?.expires).toEqual(
      new Date(Math.floor(adminSession.expires.getTime() / 1000) * 1000),
    );
    expect(mocks.fetch.mock.calls[0][1].headers.authorization).toBe("Bearer original-token");
  });
  it("resets the admin workspace when entering the user's default dashboard", async () => {
    const response = await start(request({ userId: "user_1" }));
    expect(responseCookie(response, "actorconsole.business-profile")?.maxAge).toBe(0);
  });
  it("rejects non-admins", async () => {
    mocks.user.mockResolvedValue({ role: "USER" });
    expect((await start(request({ userId: "user_1" }))).status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects a workspace belonging to a different user", async () => {
    mocks.workspace.mockResolvedValue(null);
    expect(
      (await start(request({ userId: "user_1", workspaceId: "other-workspace" }))).status,
    ).toBe(404);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(["//evil.example", "/admin", "/dashboard/../admin", "https://evil.example"])(
    "rejects unsafe redirects %s",
    async (dashboardPath) => {
      expect((await start(request({ userId: "user_1", dashboardPath }))).status).toBe(400);
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );
  it("blocks nested mimic sessions", async () => {
    mocks.session.mockResolvedValue({ ...adminSession, impersonatedById: "another_admin" });
    expect((await start(request({ userId: "user_1" }))).status).toBe(401);
  });
  it("revokes mimic access, audits exit, and restores the original workspace", async () => {
    mocks.values.set("actorconsole.original-session", "original-token");
    mocks.values.set("actorconsole.original-workspace", "admin-workspace");
    mocks.values.set("authjs.session-token", "target-token");
    mocks.session
      .mockResolvedValueOnce(adminSession)
      .mockResolvedValueOnce({
        id: "mimic_session",
        userId: "user_1",
        impersonatedById: "admin_1",
      });
    const response = await exit();
    expect((await response.json()).data.redirectTo).toBe("/admin/users/user_1");
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: "mimic_session", impersonatedById: "admin_1" },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "user.impersonation.exited", adminId: "admin_1" }),
      }),
    );
    expect(responseCookie(response, "authjs.session-token")?.value).toBe("original-token");
    expect(responseCookie(response, "actorconsole.business-profile")?.value).toBe("admin-workspace");
    expect(responseCookie(response, "actorconsole.original-session")?.maxAge).toBe(0);
  });
  it("can restore admin access after the target cookie expires", async () => {
    mocks.values.delete("authjs.session-token");
    mocks.values.set("actorconsole.original-session", "original-token");
    const response = await exit();
    expect(response.status).toBe(200);
    expect(responseCookie(response, "authjs.session-token")?.value).toBe("original-token");
  });
  it("rejects restoration from another administrator's session", async () => {
    mocks.values.set("actorconsole.original-session", "original-token");
    mocks.session
      .mockResolvedValueOnce(adminSession)
      .mockResolvedValueOnce({ impersonatedById: "other_admin" });
    expect((await exit()).status).toBe(403);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
  it("reports the target identity from the actual database session", async () => {
    mocks.values.set("actorconsole.original-session", "original-token");
    mocks.session.mockResolvedValue({
      impersonatedById: "admin_1",
      impersonationExpiresAt: new Date("2026-10-01T12:00:00Z"),
      user: { id: "user_1", name: "Owner", email: "owner@example.com" },
    });
    expect(await getMimicStatus()).toEqual({
      user: { id: "user_1", name: "Owner", email: "owner@example.com" },
      expiresAt: "2026-10-01T12:00:00.000Z",
    });
  });
});
