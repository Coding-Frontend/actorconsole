import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, updateMany, getClient, collect } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  getClient: vi.fn(),
  collect: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({ db: { businessProfile: { findFirst, updateMany } } }));
vi.mock("@actorconsole/apify", () => ({
  getUserApifyClient: getClient,
  collectWorkspaceAudience: collect,
}));
import { refreshWorkspaceAudience } from "../../src/lib/workspace-audience.js";

const workspace = { userId: "u1", businessProfileId: "w1" };
describe("background workspace audience refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue({ id: "w1", apifyMonthlyUsers: null });
    getClient.mockResolvedValue({});
    collect.mockResolvedValue({ actorCount: 646, monthlyUsers: 12000, monthlyUsersComplete: true });
  });
  it("persists Pro-sized portfolios without changing their subscription", async () => {
    await expect(refreshWorkspaceAudience(workspace)).resolves.toMatchObject({
      actorCount: 646,
      monthlyUsers: 12000,
    });
    expect(getClient).toHaveBeenCalledWith("u1", "w1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "w1", userId: "u1" },
      data: {
        apifyActorCount: 646,
        apifyMonthlyUsers: 12000,
        apifyMonthlyUsersComplete: true,
        planUsageCheckedAt: expect.any(Date),
      },
    });
  });
  it("does not erase an existing total when detailed reports are unavailable", async () => {
    findFirst.mockResolvedValue({ id: "w1", apifyMonthlyUsers: 12000 });
    collect.mockResolvedValue({ actorCount: 646, monthlyUsers: null, monthlyUsersComplete: false });
    await refreshWorkspaceAudience(workspace);
    expect(updateMany.mock.calls[0][0].data).not.toHaveProperty("apifyMonthlyUsers");
  });
  it("leaves cached data unchanged for failures so the queue can retry", async () => {
    collect.mockRejectedValue(new Error("Apify unavailable"));
    await expect(refreshWorkspaceAudience(workspace)).rejects.toThrow("Apify unavailable");
    expect(updateMany).not.toHaveBeenCalled();
  });
  it("rejects unavailable workspaces before contacting Apify", async () => {
    findFirst.mockResolvedValue(null);
    await expect(refreshWorkspaceAudience(workspace)).rejects.toThrow("Workspace is unavailable");
    expect(getClient).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
