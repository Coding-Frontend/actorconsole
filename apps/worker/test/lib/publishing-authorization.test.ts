import { beforeEach, expect, it, vi } from "vitest";
import { publishingJobSchema } from "@actorconsole/shared";
const mocks = vi.hoisted(() => ({
  grant: vi.fn(),
  claim: vi.fn(),
  owner: vi.fn(),
  key: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({ db: { $transaction: mocks.transaction } }));
import { claimManualPublishingRun } from "../../src/lib/publishing-authorization.js";
const schedule = { id: "s1", userId: "u1", businessProfileId: "w1" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.grant.mockResolvedValue({ id: "grant", apiKeyId: null });
  mocks.owner.mockResolvedValue({ id: "u1" });
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation((fn) =>
    fn({
      bulkPublishManualRun: { findFirst: mocks.grant, updateMany: mocks.claim },
      user: { findFirst: mocks.owner },
      apiKey: { findFirst: mocks.key },
    }),
  );
});
it("rejects forged legacy force flags, mixed job variants and unknown nested fields", () => {
  for (const payload of [
    { bulkPublishScheduleId: "s1", force: true },
    { bulkPublishScheduleId: "s1", manualRunAuthorizationId: "grant", evil: true },
    {
      bulkPublishScheduleId: "s1",
      bulkActorStatus: { operationId: "op", userId: "u1", businessProfileId: "w1" },
    },
    { bulkActorStatus: { operationId: "op", userId: "u1", businessProfileId: "w1", force: true } },
  ])
    expect(publishingJobSchema.safeParse(payload).success).toBe(false);
  expect(publishingJobSchema.safeParse({ bulkPublishScheduleId: "s1" }).success).toBe(true);
});
it("binds the one-time claim to schedule, workspace, owner, and expiry", async () => {
  expect(await claimManualPublishingRun("grant", schedule)).toBe(true);
  const where = {
    id: "grant",
    scheduleId: "s1",
    userId: "u1",
    businessProfileId: "w1",
    expiresAt: { gt: expect.any(Date) },
    consumedAt: null,
  };
  expect(mocks.grant).toHaveBeenCalledWith({ where });
  expect(mocks.claim).toHaveBeenCalledWith({ where, data: { consumedAt: expect.any(Date) } });
});
it("rejects absent, expired, wrong-owner, and consumed grants before any claim", async () => {
  mocks.grant.mockResolvedValue(null);
  expect(await claimManualPublishingRun("forged", schedule)).toBe(false);
  expect(mocks.claim).not.toHaveBeenCalled();
});
it("accepts only one concurrent queue delivery for a grant", async () => {
  let consumed = false;
  mocks.claim.mockImplementation(async () => {
    if (consumed) return { count: 0 };
    consumed = true;
    return { count: 1 };
  });
  expect(
    (
      await Promise.all([
        claimManualPublishingRun("grant", schedule),
        claimManualPublishingRun("grant", schedule),
      ])
    ).sort(),
  ).toEqual([false, true]);
});
it("does not honor a grant after its owner or issuing key loses authority", async () => {
  mocks.owner.mockResolvedValueOnce(null);
  expect(await claimManualPublishingRun("grant", schedule)).toBe(false);
  mocks.grant.mockResolvedValue({ apiKeyId: "key" });
  mocks.key.mockResolvedValue(null);
  expect(await claimManualPublishingRun("grant", schedule)).toBe(false);
  mocks.key.mockResolvedValue({ scopes: ["publishing:write"] });
  expect(await claimManualPublishingRun("grant", schedule)).toBe(false);
  expect(mocks.claim).not.toHaveBeenCalled();
});
