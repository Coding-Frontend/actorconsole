import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  subscription: { findUnique: vi.fn() },
  payment: {
    upsert: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  query: vi.fn(),
  queue: vi.fn(),
}));
vi.mock("@actorconsole/db", async () => {
  const db = {
    subscription: mocks.subscription,
    payment: mocks.payment,
    $queryRaw: mocks.query,
  };
  return {
    db: { ...db, $transaction: (work: (tx: unknown) => unknown) => work(db) },
    Prisma: (await import("@prisma/client")).Prisma,
    queuePaymentAnalytics: mocks.queue,
  };
});
import {
  recordPaymentCapture,
  recordPaymentRefund,
} from "../../src/lib/billing-payment-state.js";

let payment: any;
beforeEach(() => {
  vi.resetAllMocks();
  payment = {
    id: "payment",
    userId: "user",
    amount: 19,
    currency: "USD",
    analyticsAttributionId: "consent",
    refundedAmount: null,
    analyticsRefundedAmount: null,
  };
  mocks.payment.findUnique.mockImplementation(async () => ({ ...payment }));
  mocks.payment.upsert.mockImplementation(async () => ({ ...payment }));
  mocks.payment.updateMany.mockImplementation(async ({ data }) => {
    Object.assign(payment, data);
    return { count: 1 };
  });
  mocks.payment.update.mockImplementation(async ({ data }) =>
    Object.assign(payment, data),
  );
});

describe("confirmed payment measurement", () => {
  it("queues the persisted captured amount and snapshots checkout attribution only on creation", async () => {
    mocks.subscription.findUnique.mockResolvedValue({
      analyticsAttributionId: "consent",
    });
    await recordPaymentCapture({
      where: { id: "payment" },
      create: {
        subscriptionId: "subscription",
        amount: 999,
        currency: "USD",
        status: "captured",
      },
      update: {},
    });
    expect(mocks.payment.upsert.mock.calls[0][0]).toMatchObject({
      update: {},
      create: { analyticsAttributionId: "consent" },
    });
    expect(mocks.queue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 19 }),
      "purchase",
      19,
      expect.any(Date),
    );
  });
  it("does not queue an authorization as a captured purchase", async () => {
    await recordPaymentCapture({
      where: { id: "payment" },
      create: { amount: 19, status: "authorized" },
      update: {},
    });
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("deduplicates repeated/older refund snapshots and queues only each incremental amount", async () => {
    await recordPaymentRefund("payment", 3);
    await recordPaymentRefund("payment", 3);
    await recordPaymentRefund("payment", 8);
    await recordPaymentRefund("payment", 2);
    expect(
      mocks.queue.mock.calls.map((call) => [call[2], call[3], call[5]]),
    ).toEqual([
      ["refund", 3, "3.000"],
      ["refund", 5, "8.000"],
    ]);
    expect(payment).toMatchObject({
      refundedAmount: 8,
      analyticsRefundedAmount: 8,
      status: "partially_refunded",
    });
  });
  it("does not lose confirmation when the admin refund endpoint updated the ledger first", async () => {
    payment.refundedAmount = 8;
    await recordPaymentRefund("payment", 3);
    expect(mocks.queue.mock.calls[0][3]).toBe(3);
    expect(payment.refundedAmount).toBe(8);
    expect(payment.analyticsRefundedAmount).toBe(3);
    await recordPaymentRefund("payment", 8);
    expect(mocks.queue.mock.calls[1][3]).toBe(5);
  });
  it("uses decimal arithmetic for small and three-decimal currencies", async () => {
    await recordPaymentRefund("payment", 0.001);
    await recordPaymentRefund("payment", 0.003);
    expect(mocks.queue.mock.calls.map((call) => call[3])).toEqual([
      0.001, 0.002,
    ]);
  });
  it("rejects amounts beyond the captured value without altering the ledger", async () => {
    await expect(recordPaymentRefund("payment", 20)).rejects.toThrow("exceeds");
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.payment.updateMany).not.toHaveBeenCalled();
  });
});
