import { describe, expect, it, vi } from "vitest";
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    subscription: { findMany: vi.fn(), updateMany: vi.fn() },
    businessProfile: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@actorconsole/db", () => ({ db: dbMock }));
import { reconcileExpiredSubscriptions } from "../../src/lib/subscription-expiry.js";
describe("terminal subscription expiry", () => {
  it.each([
    ["stripe", "canceled"],
    ["stripe", "unpaid"],
    ["stripe", "incomplete_expired"],
    ["stripe", "paused"],
    ["dodo", "failed"],
    ["dodo", "expired"],
    ["dodo", "cancelled"],
  ])("removes expired %s %s entitlement", async (provider, status) => {
    let plan = "PRO";
    const row = {
      id: "sub_1",
      businessProfileId: "workspace_1",
      provider,
      status,
      currentPeriodEnd: new Date(0),
    };
    dbMock.subscription.findMany.mockImplementation(async ({ where }) => {
      const matches =
        row.currentPeriodEnd <= where.currentPeriodEnd.lte &&
        where.OR.some((condition: any) =>
          condition.provider
            ? condition.provider === row.provider && condition.status === row.status
            : condition.status.in.includes(row.status),
        );
      return matches ? [row] : [];
    });
    dbMock.subscription.updateMany.mockResolvedValue({ count: 1 });
    dbMock.businessProfile.update.mockImplementation(async ({ data }) => {
      plan = data.plan;
      return {};
    });
    dbMock.$transaction.mockImplementation(async (work) => work(dbMock));
    await reconcileExpiredSubscriptions();
    expect(plan).toBe("FREE");
  });
  it("does not downgrade a renewal that wins after the expiry scan", async () => {
    dbMock.subscription.findMany.mockResolvedValue([
      {
        id: "sub_1",
        businessProfileId: "workspace_1",
        provider: "stripe",
        status: "canceled",
        currentPeriodEnd: new Date(0),
        stateVersion: 1,
      },
    ]);
    dbMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    dbMock.businessProfile.update.mockClear();
    expect(await reconcileExpiredSubscriptions()).toBe(0);
    expect(dbMock.businessProfile.update).not.toHaveBeenCalled();
    expect(dbMock.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stateVersion: 1,
          status: "canceled",
          currentPeriodEnd: new Date(0),
        }),
      }),
    );
  });
});
