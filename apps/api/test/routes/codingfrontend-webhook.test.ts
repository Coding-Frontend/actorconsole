import { createHmac } from "node:crypto";
import { Hono } from "hono";
import { beforeEach, expect, it, vi } from "vitest";

const { db, settings, lease, analytics } = vi.hoisted(() => ({
  db: {
    payment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    subscription: { findUnique: vi.fn(), update: vi.fn() },
    billingCheckoutOperation: { findUnique: vi.fn(), update: vi.fn() },
    businessProfile: { update: vi.fn() },
    $transaction: vi.fn(),
  },
  settings: vi.fn(),
  lease: { claim: vi.fn(), complete: vi.fn(), fail: vi.fn() },
  analytics: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({ db, queuePaymentAnalytics: analytics }));
vi.mock("../../src/lib/billing-checkout-operations.js", () => ({ lockBillingWorkspace: vi.fn() }));
vi.mock("../../src/lib/payment-gateway-settings.js", () => ({
  getGatewayContext: vi.fn(),
  getPaymentSetting: settings,
  isPaymentMode: (mode: unknown) => mode === "test" || mode === "live",
}));
vi.mock("../../src/lib/payment-webhook-delivery.js", () => ({
  claimPaymentWebhook: lease.claim,
  completePaymentWebhook: lease.complete,
  failPaymentWebhook: lease.fail,
}));

import { codingFrontendWebhook } from "../../src/routes/codingfrontend-webhook.js";

const app = new Hono().post("/webhook", codingFrontendWebhook);
const id = "a".repeat(32);
const secret = "b".repeat(64);
const workspace = "workspace_1";
const slug = "actorconsole-pro-monthly";
const paymentId = "pay_Test123";

function send(options: { mode?: "test" | "live"; amount?: number; refunded?: number; signer?: string; stale?: boolean } = {}) {
  const { mode = "live", amount = 900, refunded, signer = secret, stale } = options;
  const type = refunded ? "checkout.refunded" : "checkout.paid";
  const body = JSON.stringify({
    type,
    id: `${type}:${id}${refunded ? `:${refunded}` : ""}`,
    data: {
      checkout_id: id, plan: slug, payment_id: paymentId, amount,
      currency: "USD", mode, paid_at: new Date().toISOString(),
      ...(refunded ? { refunded_amount: refunded } : {}),
    },
  });
  const time = String(Math.floor(Date.now() / 1000) - (stale ? 301 : 0));
  return app.request(`/webhook?mode=${mode}`, {
    method: "POST",
    headers: {
      "x-codingfrontend-timestamp": time,
      "x-codingfrontend-signature": createHmac("sha256", signer).update(time + "." + body).digest("hex"),
    },
    body,
  });
}

function pending(mode = "live") {
  db.billingCheckoutOperation.findUnique.mockResolvedValue({
    id, provider: "codingfrontend", billingMode: mode, amountMinor: 900, productId: slug,
    interval: "month", currency: "USD", businessProfileId: workspace, userId: "user_1",
    status: "RESERVED", createdAt: new Date(Date.now() - 1000),
  });
  db.subscription.findUnique.mockResolvedValue({
    id: "sub", provider: "codingfrontend", checkoutOperationId: id,
    status: "checkout_pending", billingMode: mode,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  settings.mockImplementation(async (key) => key.endsWith("_month") ? secret : null);
  lease.claim.mockResolvedValue({ state: "claimed", lease: { id: "lease" } });
  db.$transaction.mockImplementation(async (work) => work(db));
  db.payment.findUnique.mockResolvedValue(null);
  db.payment.create.mockImplementation(async ({ data }) => ({ id: "ledger", ...data }));
  pending();
});

it("fulfills only the amount and workspace reserved by ActorConsole", async () => {
  expect((await send({ signer: "invalid" })).status).toBe(401);
  expect((await send({ stale: true })).status).toBe(401);
  expect((await send({ amount: 901 })).status).toBe(409);
  expect(db.payment.create).not.toHaveBeenCalled();
  expect((await send()).status).toBe(200);
  expect(db.payment.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ businessProfileId: workspace, amount: 9, providerPaymentId: paymentId }),
  });
  expect(db.businessProfile.update).toHaveBeenCalledWith({ where: { id: workspace }, data: { plan: "PRO" } });
  lease.claim.mockResolvedValue({ state: "duplicate" });
  expect((await send()).status).toBe(200);
  expect(db.payment.create).toHaveBeenCalledTimes(1);
});

it("records a test payment without changing workspace access", async () => {
  pending("test");
  expect((await send({ mode: "test" })).status).toBe(200);
  expect(db.payment.create).toHaveBeenCalled();
  expect(db.subscription.update).toHaveBeenCalledWith({
    where: { id: "sub" }, data: expect.objectContaining({ status: "test_completed", currentPeriodEnd: null }),
  });
  expect(db.businessProfile.update).not.toHaveBeenCalled();
});

it("applies a full refund once and only to the original prepaid period", async () => {
  const payment = {
    id: "ledger", businessProfileId: workspace, billingMode: "live", amount: 9,
    currency: "USD", providerOrderId: id, refundedAmount: 0, notes: { interval: "month", plan: slug },
  };
  db.payment.findUnique.mockResolvedValue(payment);
  db.subscription.findUnique.mockResolvedValue({ id: "sub", provider: "codingfrontend", providerCheckoutId: id });
  expect((await send({ refunded: 200 })).status).toBe(200);
  expect(db.businessProfile.update).not.toHaveBeenCalled();
  db.payment.findUnique.mockResolvedValue({ ...payment, refundedAmount: 2 });
  expect((await send({ refunded: 900 })).status).toBe(200);
  expect(db.businessProfile.update).toHaveBeenCalledWith({ where: { id: workspace }, data: { plan: "FREE" } });
  db.payment.findUnique.mockResolvedValue({ ...payment, refundedAmount: 9 });
  expect((await send({ refunded: 900 })).status).toBe(200);
  expect(db.payment.update).toHaveBeenCalledTimes(2);
});
