import { describe, expect, it, vi } from "vitest";
import type { ApifyActorDetail, ApifyActorSummary } from "./types";
import { collectWorkspaceAudience } from "./workspace-audience";

function actor(id: string, stats: ApifyActorSummary["stats"] = null): ApifyActorSummary {
  return {
    id,
    username: "builder",
    name: id,
    title: null,
    description: null,
    pictureUrl: null,
    isPublic: true,
    stats,
    url: `https://apify.com/builder/${id}`,
  };
}
function detail(id: string, stats: ApifyActorSummary["stats"]): ApifyActorDetail {
  return {
    ...actor(id, stats),
    readme: null,
    seoTitle: null,
    seoDescription: null,
    inputSchema: null,
    outputSchema: null,
  };
}

describe("workspace audience collection", () => {
  it("hydrates compact inventory statistics from actor details", async () => {
    const getActor = vi
      .fn()
      .mockResolvedValueOnce(detail("a1", { totalUsers30Days: 900 }))
      .mockResolvedValueOnce(detail("a2", { monthlyUsers: 300 }));
    const compact = [actor("a1"), actor("a2")];
    const result = await collectWorkspaceAudience({
      listMyActors: vi.fn().mockResolvedValue(compact),
      getActor,
    });
    expect(result).toEqual({ actorCount: 2, monthlyUsers: 1200, monthlyUsersComplete: true });
    expect(getActor.mock.calls).toEqual([["a1"], ["a2"]]);
    expect(compact[0].stats).toBeNull();
  });
  it("keeps reported zeros and fetches only missing counts", async () => {
    const getActor = vi.fn().mockResolvedValue(detail("a2", { totalUsers30Days: 15 }));
    const result = await collectWorkspaceAudience({
      listMyActors: vi
        .fn()
        .mockResolvedValue([
          actor("a1", { totalUsers30Days: 0, monthlyUsers: 900 }),
          actor("a2"),
          actor("a3", { monthlyUsers: 12 }),
        ]),
      getActor,
    });
    expect(result.monthlyUsers).toBe(27);
    expect(getActor).toHaveBeenCalledOnce();
    expect(getActor).toHaveBeenCalledWith("a2");
  });
  it("paginates a large portfolio and counts duplicate IDs once", async () => {
    const first = Array.from({ length: 1000 }, (_, i) => actor(`a${i}`, { totalUsers30Days: 1 }));
    const listMyActors = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([first[0], actor("last", { totalUsers30Days: 5 })]);
    const getActor = vi.fn();
    const result = await collectWorkspaceAudience({ listMyActors, getActor });
    expect(result).toEqual({ actorCount: 1001, monthlyUsers: 1005, monthlyUsersComplete: true });
    expect(listMyActors.mock.calls).toEqual([
      [{ limit: 1000, offset: 0 }],
      [{ limit: 1000, offset: 1000 }],
    ]);
    expect(getActor).not.toHaveBeenCalled();
  });
  it("bounds detail request concurrency for large workspaces", async () => {
    let active = 0;
    let peak = 0;
    const getActor = vi.fn(async (id: string) => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return detail(id, { totalUsers30Days: 1 });
    });
    const result = await collectWorkspaceAudience({
      listMyActors: vi.fn().mockResolvedValue(Array.from({ length: 16 }, (_, i) => actor(`a${i}`))),
      getActor,
    });
    expect(result.monthlyUsers).toBe(16);
    expect(peak).toBe(5);
  });
  it("does not substitute all-time users or zero for missing reports", async () => {
    const result = await collectWorkspaceAudience({
      listMyActors: vi.fn().mockResolvedValue([actor("a1")]),
      getActor: vi.fn().mockResolvedValue(detail("a1", { totalUsers: 100000 })),
    });
    expect(result).toEqual({ actorCount: 1, monthlyUsers: null, monthlyUsersComplete: false });
  });
  it("returns partial reports as a lower bound", async () => {
    const result = await collectWorkspaceAudience({
      listMyActors: vi.fn().mockResolvedValue([actor("a1", { totalUsers30Days: 20 }), actor("a2")]),
      getActor: vi.fn().mockResolvedValue(detail("a2", null)),
    });
    expect(result).toEqual({ actorCount: 2, monthlyUsers: 20, monthlyUsersComplete: false });
  });
  it("retries changed inventory and request failures rather than clearing totals", async () => {
    await expect(
      collectWorkspaceAudience({
        listMyActors: vi.fn().mockResolvedValue([actor("a1")]),
        getActor: vi.fn().mockResolvedValue(null),
      }),
    ).rejects.toThrow("inventory changed");
    await expect(
      collectWorkspaceAudience({
        listMyActors: vi.fn().mockResolvedValue([actor("a1")]),
        getActor: vi.fn().mockRejectedValue(new Error("Apify unavailable")),
      }),
    ).rejects.toThrow("Apify unavailable");
  });
});
