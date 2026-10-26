import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { delivery, UniqueError } = vi.hoisted(() => ({
  delivery: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  UniqueError: class extends Error {
    code = "P2002";
  },
}));
vi.mock("@actorconsole/db", () => ({
  db: { webhookDelivery: delivery },
  Prisma: { PrismaClientKnownRequestError: UniqueError },
}));
import {
  claimPaymentWebhook,
  completePaymentWebhook,
  failPaymentWebhook,
} from "../../src/lib/payment-webhook-delivery.js";

type Row = { id: string; status: string; attemptedAt: Date };
const input = {
  source: "stripe:test",
  externalId: "evt_1",
  eventType: "invoice.paid",
  payload: {},
};

describe("payment webhook delivery ownership", () => {
  let row: Row | null;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
    vi.clearAllMocks();
    row = null;
    delivery.findUnique.mockImplementation(async () => (row ? { ...row } : null));
    delivery.create.mockImplementation(async ({ data }) => {
      if (row) throw new UniqueError();
      row = { id: "delivery_1", status: data.status, attemptedAt: data.attemptedAt };
      return { id: row.id };
    });
    delivery.updateMany.mockImplementation(async ({ where, data }) => {
      if (
        !row ||
        row.id !== where.id ||
        row.status !== where.status ||
        row.attemptedAt.getTime() !== where.attemptedAt.getTime()
      )
        return { count: 0 };
      row = { ...row, ...data };
      return { count: 1 };
    });
  });
  afterEach(() => vi.useRealTimers());

  it("lets only one of two simultaneous initial deliveries process", async () => {
    const claims = await Promise.all([claimPaymentWebhook(input), claimPaymentWebhook(input)]);
    expect(claims.map((claim) => claim.state).sort()).toEqual(["claimed", "in_progress"]);
  });

  it("retries a failed attempt and acknowledges only its completed result", async () => {
    const first = await claimPaymentWebhook(input);
    if (first.state !== "claimed") throw new Error("Expected ownership");
    await failPaymentWebhook(first.lease, new Error("Temporary database outage"));
    const retry = await claimPaymentWebhook(input);
    if (retry.state !== "claimed") throw new Error("Expected retry ownership");
    expect(retry.lease.attemptedAt.getTime()).toBeGreaterThan(first.lease.attemptedAt.getTime());
    await completePaymentWebhook(retry.lease);
    expect(await claimPaymentWebhook(input)).toEqual({ state: "duplicate" });
  });

  it("lets only one concurrent retry reclaim the same failed attempt", async () => {
    row = { id: "delivery_1", status: "failed", attemptedAt: new Date(0) };
    const claims = await Promise.all([claimPaymentWebhook(input), claimPaymentWebhook(input)]);
    expect(claims.map((claim) => claim.state).sort()).toEqual(["claimed", "in_progress"]);
  });

  it("returns a retryable result while the original attempt is still running", async () => {
    await claimPaymentWebhook(input);
    vi.advanceTimersByTime(5 * 60_000);
    expect(await claimPaymentWebhook(input)).toEqual({ state: "in_progress" });
  });

  it("reclaims an interrupted attempt without letting its old owner overwrite the new result", async () => {
    const first = await claimPaymentWebhook(input);
    if (first.state !== "claimed") throw new Error("Expected ownership");
    vi.advanceTimersByTime(5 * 60_000 + 1);
    const retry = await claimPaymentWebhook(input);
    if (retry.state !== "claimed") throw new Error("Expected retry ownership");
    await expect(completePaymentWebhook(first.lease)).rejects.toThrow("lease changed");
    await failPaymentWebhook(first.lease, new Error("Late failure"));
    expect(row?.status).toBe("received");
    await completePaymentWebhook(retry.lease);
    await failPaymentWebhook(first.lease, new Error("Late failure"));
    expect(row?.status).toBe("processed");
  });

  it("propagates database errors instead of acknowledging the event", async () => {
    delivery.create.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(claimPaymentWebhook(input)).rejects.toThrow("Database unavailable");
  });
});
