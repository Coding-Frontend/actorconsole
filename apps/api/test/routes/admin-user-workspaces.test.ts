import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../src/app.js";
import { requireAdmin } from "../../src/middleware/admin.js";
import { onErrorHandler } from "../../src/middleware/error.js";

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  session: vi.fn(),
  actors: vi.fn(),
  schedules: vi.fn(),
  notifications: vi.fn(),
  keys: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({
  db: {
    businessProfile: { findFirst: mocks.workspace },
    session: { findUnique: mocks.session },
    actor: { findMany: mocks.actors },
    bulkPublishSchedule: { findMany: mocks.schedules },
    notification: { findMany: mocks.notifications },
    apiKey: { findMany: mocks.keys },
  },
}));
vi.mock("../../src/routes/actors.js", () => ({ readWorkspaceFinancialReport: mocks.report }));
import { adminUserWorkspaceRoutes } from "../../src/routes/admin-user-workspaces.js";

function app() {
  return new Hono<AppEnv>()
    .onError(onErrorHandler)
    .use("*", requireAdmin())
    .route("/admin/users", adminUserWorkspaceRoutes);
}
const path = "/admin/users/user_1/workspaces/workspace_1";
const workspace = {
  id: "workspace_1",
  userId: "user_1",
  name: "Team",
  plan: "PRO",
  user: { email: "owner@example.com" },
  _count: { actors: 51, bulkPublishSchedules: 2, notifications: 3, apiKeys: 1 },
};

describe("Admin workspace inspection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      user: { id: "admin_1", role: "ADMIN", email: "admin@example.com", suspendedAt: null },
    });
    mocks.workspace.mockResolvedValue(workspace);
    mocks.actors.mockResolvedValue([{ id: "actor_1", title: "Scraper" }]);
  });
  const request = (url: string) =>
    app().request(url, { headers: { authorization: "Bearer admin-session" } });

  it("requires administrator authentication", async () => {
    expect((await app().request(path)).status).toBe(401);
    mocks.session.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      user: { role: "USER" },
    });
    expect((await request(path)).status).toBe(403);
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("blocks admin access from a mimic session even if the target was promoted", async () => {
    mocks.session.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      impersonatedById: "admin_1",
      user: { role: "ADMIN" },
    });
    expect((await request(path)).status).toBe(403);
  });
  it("checks workspace ownership before returning records", async () => {
    mocks.workspace.mockResolvedValue(null);
    expect((await request(path)).status).toBe(404);
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "workspace_1", userId: "user_1" } }),
    );
    expect(mocks.actors).not.toHaveBeenCalled();
  });
  it("paginates actors within the selected user and workspace", async () => {
    const response = await request(`${path}?page=2&limit=25`);
    expect(response.status).toBe(200);
    expect(mocks.actors).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1", businessProfileId: "workspace_1" },
        skip: 25,
        take: 25,
      }),
    );
    expect((await response.json()).data.total).toBe(51);
  });
  it.each(["schedules", "notifications", "api-keys"])(
    "loads scoped %s without credential secrets",
    async (section) => {
      const mock =
        section === "schedules"
          ? mocks.schedules
          : section === "notifications"
            ? mocks.notifications
            : mocks.keys;
      mock.mockResolvedValue([]);
      const response = await request(`${path}?section=${section}`);
      expect(response.status).toBe(200);
      expect(mock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user_1", businessProfileId: "workspace_1" } }),
      );
      const select = mock.mock.calls[0][0].select;
      expect(select).not.toHaveProperty("keyHash");
      const connectionSelect = mocks.workspace.mock.calls[0][0].select.apifyTokens.select;
      expect(connectionSelect).not.toHaveProperty("encryptedToken");
      expect(connectionSelect).not.toHaveProperty("encryptedCookies");
      expect(connectionSelect).not.toHaveProperty("encryptedUiToken");
    },
  );
  it.each(["?section=unknown", "?page=0", "?page=bad"])(
    "rejects invalid queries %s",
    async (query) => {
      expect((await request(path + query)).status).toBe(400);
    },
  );
  it("reuses the user financial report with the selected workspace identity", async () => {
    mocks.report.mockImplementation((context) =>
      context.json({ ok: true, data: context.get("session") }),
    );
    const response = await request(`${path}/analytics/revenue`);
    expect((await response.json()).data).toEqual({
      userId: "user_1",
      email: "owner@example.com",
      plan: "PRO",
      businessProfileId: "workspace_1",
    });
  });
  it("does not run analytics for another user's workspace", async () => {
    mocks.workspace.mockResolvedValue(null);
    expect((await request(`${path}/analytics/usage`)).status).toBe(404);
    expect(mocks.report).not.toHaveBeenCalled();
  });
});
