import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  key: vi.fn(), session: vi.fn(), workspace: vi.fn(), usage: vi.fn(),
  tickets: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("@actorconsole/db", () => ({ db: {
  apiKey: { findUnique: mocks.key }, session: { findUnique: mocks.session },
  businessProfile: { findFirst: mocks.workspace }, usageRecord: { upsert: mocks.usage },
  ticket: mocks.tickets,
} }));
vi.mock("../../src/lib/queue.js", () => ({ getRedis: () => null }));
import { app } from "../../src/app.js";

const user = { id: "owner", email: "owner@example.test", plan: "PRO", suspendedAt: null };
const workspace = { id: "workspace-a", userId: user.id, plan: "PRO" };
describe("support requires an interactive account session", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.key.mockResolvedValue({
      id: "key-a", userId: user.id, revokedAt: null, expiresAt: null, lastUsedAt: new Date(),
      scopes: ["mcp", "actors:read"], actorIds: [], businessProfile: workspace, user,
    });
    mocks.workspace.mockResolvedValue(workspace);
    mocks.usage.mockResolvedValue({});
    mocks.tickets.findMany.mockResolvedValue([{ id: "ticket-b", userId: user.id, businessProfileId: "workspace-b" }]);
    mocks.tickets.count.mockResolvedValue(1);
  });

  it.each([
    ["GET", "/tickets"], ["GET", "/tickets/ticket-b"], ["POST", "/tickets"],
    ["POST", "/tickets/ticket-b/messages"], ["POST", "/tickets/ticket-b/close"],
    ["POST", "/tickets/ticket-b/status"], ["POST", "/tickets/ticket-b/assign"],
    ["POST", "/tickets/ticket-b/priority"],
  ])("rejects an actors-only workspace key for %s %s before reading or mutating support", async (method, path) => {
    const response = await app.request(path, {
      method, headers: { authorization: `Bearer al_${"a".repeat(64)}`, "content-type": "application/json" },
      body: method === "GET" ? undefined : "{}",
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("interactive_session_required");
    for (const operation of Object.values(mocks.tickets)) expect(operation).not.toHaveBeenCalled();
  });

  it("preserves account-wide support for a browser session", async () => {
    mocks.session.mockResolvedValue({ expires: new Date(Date.now() + 60_000), user });
    const response = await app.request("/tickets", { headers: { cookie: "authjs.session-token=browser-fixture" } });
    expect(response.status).toBe(200);
    expect(mocks.tickets.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: user.id } }));
  });
});
