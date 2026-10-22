import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx, transaction } = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    actor: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
    businessProfile: { update: vi.fn() },
  },
  transaction: vi.fn(),
}));
vi.mock("./client.js", () => ({ db: { $transaction: transaction } }));
import { admitWorkspaceActors } from "./workspace-actor-import.js";

const actor = (id: number, monthlyUsers?: number) => ({
  id: `ap-${id}`,
  username: "builder",
  name: `actor-${id}`,
  title: null,
  description: null,
  pictureUrl: null,
  stats: monthlyUsers === undefined ? null : { totalUsers30Days: monthlyUsers },
});

describe("admitWorkspaceActors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.mockImplementation((run) => run(tx));
    tx.$queryRaw.mockResolvedValue([{ plan: "FREE" }]);
    tx.actor.findMany.mockResolvedValue([]);
    tx.actor.createMany.mockResolvedValue({ count: 50 });
    tx.actor.updateMany.mockResolvedValue({ count: 1 });
    tx.businessProfile.update.mockResolvedValue({});
  });

  it("admits exactly 50 actors and 500 summed monthly users", async () => {
    const result = await admitWorkspaceActors(
      "u1",
      "bp1",
      Array.from({ length: 50 }, (_, i) => actor(i, 10)),
    );
    expect(result).toMatchObject({
      created: 50,
      skipped: 0,
      usage: { monthlyUsers: 500, upgradeRequired: false },
    });
    expect(result.items).toHaveLength(50);
  });

  it("skips actor 51 while preserving the 50 admitted actors", async () => {
    const result = await admitWorkspaceActors(
      "u1",
      "bp1",
      Array.from({ length: 51 }, (_, i) => actor(i, 1)),
    );
    expect(result).toMatchObject({ created: 50, skipped: 1, usage: { actorLimitExceeded: true } });
    expect(tx.actor.createMany.mock.calls[0][0].data).toHaveLength(50);
  });

  it("uses the remaining slots in this workspace and refreshes existing actors", async () => {
    tx.actor.findMany.mockResolvedValue(
      Array.from({ length: 49 }, (_, i) => ({ apifyActorId: `ap-${i}` })),
    );
    const result = await admitWorkspaceActors("u1", "bp1", [
      actor(0, 1),
      actor(49, 1),
      actor(50, 1),
    ]);
    expect(result).toMatchObject({ created: 1, skipped: 1, trackedCount: 50 });
    expect(result.items).toHaveLength(2);
    expect(tx.actor.findMany).toHaveBeenCalledWith({
      where: { businessProfileId: "bp1", userId: "u1" },
      select: { apifyActorId: true },
    });
  });

  it("blocks new imports at 501 users even with fewer than 50 actors", async () => {
    tx.actor.findMany.mockResolvedValue([{ apifyActorId: "ap-0" }]);
    const result = await admitWorkspaceActors("u1", "bp1", [actor(0, 300), actor(1, 201)]);
    expect(result).toMatchObject({
      created: 0,
      skipped: 1,
      usage: { monthlyUserLimitExceeded: true },
    });
    expect(result.items.map((item) => item.id)).toEqual(["ap-0"]);
    expect(tx.actor.createMany).not.toHaveBeenCalled();
  });

  it("counts untracked actors and uses monthlyUsers only as a fallback", async () => {
    const result = await admitWorkspaceActors("u1", "bp1", [
      actor(0, 400),
      { ...actor(1), stats: { monthlyUsers: 101 } },
      { ...actor(2, 0), stats: { totalUsers30Days: 0, monthlyUsers: 999 } },
    ]);
    expect(result.usage.monthlyUsers).toBe(501);
    expect(result.created).toBe(0);
  });

  it("does not count duplicate IDs twice or substitute lifetime users for missing monthly data", async () => {
    const result = await admitWorkspaceActors("u1", "bp1", [
      actor(0, 300),
      actor(0, 300),
      { ...actor(1), stats: { totalUsers: 100000 } },
    ]);
    expect(result.usage).toMatchObject({
      actorCount: 2,
      monthlyUsers: 300,
      upgradeRequired: false,
    });
    expect(tx.businessProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ apifyMonthlyUsersComplete: false }),
      }),
    );
  });

  it("preserves unknown monthly usage instead of reporting zero", async () => {
    const result = await admitWorkspaceActors("u1", "bp1", [actor(0)]);
    expect(result.usage.monthlyUsers).toBeNull();
    expect(tx.businessProfile.update.mock.calls[0][0].data).not.toHaveProperty("apifyMonthlyUsers");
    expect(tx.businessProfile.update.mock.calls[0][0].data).not.toHaveProperty(
      "planUsageCheckedAt",
    );
  });
  it("retains the known audience limit when a compact inventory omits statistics", async () => {
    tx.$queryRaw.mockResolvedValue([{ plan: "FREE", apifyMonthlyUsers: 501 }]);
    const result = await admitWorkspaceActors("u1", "bp1", [actor(0)]);
    expect(result.usage.monthlyUsers).toBe(501);
    expect(result.created).toBe(0);
    expect(tx.businessProfile.update.mock.calls[0][0].data).not.toHaveProperty("apifyMonthlyUsers");
  });

  it("prioritizes the most recently modified new actors when there is one slot", async () => {
    tx.actor.findMany.mockResolvedValue(
      Array.from({ length: 49 }, (_, i) => ({ apifyActorId: `tracked-${i}` })),
    );
    const result = await admitWorkspaceActors("u1", "bp1", [
      { ...actor(0, 1), modifiedAt: "2026-09-01T00:00:00Z" },
      { ...actor(1, 1), modifiedAt: "2026-10-01T00:00:00Z" },
    ]);
    expect(result.items.map((item) => item.id)).toEqual(["ap-1"]);
  });

  it("imports portfolios above both limits on Pro", async () => {
    tx.$queryRaw.mockResolvedValue([{ plan: "PRO" }]);
    const result = await admitWorkspaceActors(
      "u1",
      "bp1",
      Array.from({ length: 51 }, (_, i) => actor(i, 100)),
    );
    expect(result).toMatchObject({ created: 51, skipped: 0, usage: { upgradeRequired: false } });
  });

  it("refuses an unavailable or unowned workspace before creating actors", async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(admitWorkspaceActors("u1", "other-workspace", [actor(0)])).rejects.toThrow(
      "Workspace is unavailable",
    );
    expect(tx.actor.createMany).not.toHaveBeenCalled();
  });

  it("fills remaining slots after the workspace becomes eligible again", async () => {
    tx.actor.findMany.mockResolvedValue([{ apifyActorId: "ap-0" }]);
    const result = await admitWorkspaceActors("u1", "bp1", [actor(0, 250), actor(1, 250)]);
    expect(result).toMatchObject({ created: 1, skipped: 0, usage: { upgradeRequired: false } });
  });

  it("archives missing Actors only within the owned workspace and preserves their history", async () => {
    tx.actor.findMany.mockResolvedValue([{ apifyActorId: "ap-0" }, { apifyActorId: "ap-1" }]);
    const result = await admitWorkspaceActors("u1", "bp1", [actor(0, 1)], { reconcile: true });

    expect(tx.actor.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        businessProfileId: "bp1",
        userId: "u1",
        apifyRemovedAt: null,
        apifyActorId: { notIn: ["ap-0"] },
      },
      data: {
        apifyRemovedAt: expect.any(Date),
        storeIsPublic: null,
        storeIsDeprecated: null,
        storeNotice: null,
        storeStatusSyncedAt: null,
      },
    });
    expect(result).toMatchObject({ created: 0, trackedCount: 1 });
    expect(tx.actor.createMany).not.toHaveBeenCalled();
  });

  it("reconciles an empty inventory after the last Actor is deleted", async () => {
    tx.actor.findMany.mockResolvedValue([{ apifyActorId: "ap-0" }]);
    const result = await admitWorkspaceActors("u1", "bp1", [], { reconcile: true });

    expect(tx.actor.updateMany).toHaveBeenCalledOnce();
    expect(tx.actor.updateMany.mock.calls[0][0].where).toEqual({
      businessProfileId: "bp1",
      userId: "u1",
      apifyRemovedAt: null,
    });
    expect(result).toMatchObject({ items: [], trackedCount: 0, created: 0 });
    expect(tx.businessProfile.update.mock.calls[0][0].data.apifyActorCount).toBe(0);
  });

  it("restores existing Actors that reappear without recreating their history", async () => {
    tx.actor.findMany.mockResolvedValue([{ apifyActorId: "ap-0" }]);
    const result = await admitWorkspaceActors("u1", "bp1", [actor(0)], { reconcile: true });

    expect(tx.actor.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        businessProfileId: "bp1",
        userId: "u1",
        apifyActorId: { in: ["ap-0"] },
        apifyRemovedAt: { not: null },
      },
      data: { apifyRemovedAt: null },
    });
    expect(result).toMatchObject({ created: 0, trackedCount: 1 });
    expect(tx.actor.createMany).not.toHaveBeenCalled();
  });

  it("frees admission slots previously occupied by missing Actors", async () => {
    tx.actor.findMany.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({ apifyActorId: `ap-${i}` })),
    );
    const inventory = [...Array.from({ length: 49 }, (_, i) => actor(i, 1)), actor(50, 1)];
    const result = await admitWorkspaceActors("u1", "bp1", inventory, { reconcile: true });
    expect(result).toMatchObject({ created: 1, skipped: 0, trackedCount: 50 });
    expect(result.items).toHaveLength(50);
  });

  it("does not reconcile a partial admission request", async () => {
    await admitWorkspaceActors("u1", "bp1", [actor(0)]);
    expect(tx.actor.updateMany).not.toHaveBeenCalled();
  });
});
