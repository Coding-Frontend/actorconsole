import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockCreateCheckout,
  mockCancel,
  mockReadiness,
  mockDodoClient,
  mockConfiguredProduct,
  mockStripeClient,
  mockGetIntegration,
} = vi.hoisted(() => ({
  mockDb: {
    paymentGateway: { findUnique: vi.fn() },
    subscription: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    webhookDelivery: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    businessProfile: { findFirst: vi.fn(), update: vi.fn() },
    payment: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  mockCreateCheckout: vi.fn(),
  mockCancel: vi.fn(),
  mockReadiness: vi.fn(),
  mockDodoClient: vi.fn(),
  mockConfiguredProduct: vi.fn(),
  mockStripeClient: vi.fn(),
  mockGetIntegration: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({
  db: mockDb,
  Prisma: { JsonNull: null, PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("../../src/lib/billing-providers.js", () => ({
  createProviderCheckout: (...args: unknown[]) => mockCreateCheckout(...args),
  configuredCheckoutProduct: (...args: unknown[]) => mockConfiguredProduct(...args),
  cancelProviderSubscription: (...args: unknown[]) => mockCancel(...args),
  gatewayReadiness: (...args: unknown[]) => mockReadiness(...args),
  getDodoClient: (...args: unknown[]) => mockDodoClient(...args),
  getStripeClient: (...args: unknown[]) => mockStripeClient(...args),
}));
vi.mock("../../src/lib/integrations.js", () => ({
  getIntegration: (...args: unknown[]) => mockGetIntegration(...args),
}));
vi.mock("../../src/lib/analytics.js", () => ({ trackEvent: vi.fn() }));
vi.mock("@actorconsole/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@actorconsole/shared")>()),
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { billingRoutes } from "../../src/routes/billing.js";

function buildApp() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set(
      "session" as never,
      {
        userId: "user_1",
        businessProfileId: "workspace_1",
        plan: "FREE",
      } as never,
    );
    await next();
  });
  app.route("/billing", billingRoutes);
  return app;
}

describe("Provider-neutral billing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIntegration.mockReset();
    mockStripeClient.mockReset();
    mockDb.paymentGateway.findUnique.mockResolvedValue({
      key: "stripe",
      name: "Stripe",
      enabled: true,
    });
    mockReadiness.mockResolvedValue({ ready: true });
    mockConfiguredProduct.mockResolvedValue("price_year");
    mockDb.subscription.findUnique.mockResolvedValue(null);
    mockDb.subscription.findFirst.mockResolvedValue(null);
    mockDb.user.findUnique.mockResolvedValue({ email: "payer@example.com", name: "Payer" });
    mockDb.subscription.upsert.mockResolvedValue({ id: "sub_local" });
    mockCreateCheckout.mockResolvedValue({
      gateway: "stripe",
      checkoutId: "cs_test_123",
      checkoutUrl: "https://checkout.stripe.test/session",
      providerProductId: "price_test_123",
      status: "open",
    });
    mockDb.webhookDelivery.findUnique.mockResolvedValue(null);
    mockDb.webhookDelivery.create.mockResolvedValue({ id: "delivery_1" });
    mockDb.webhookDelivery.update.mockResolvedValue({});
    mockDb.webhookDelivery.updateMany.mockResolvedValue({ count: 1 });
    mockDb.businessProfile.update.mockResolvedValue({});
    mockDb.payment.upsert.mockResolvedValue({});
    mockDb.payment.findUnique.mockResolvedValue(null);
    mockDb.payment.update.mockResolvedValue({});
    mockDb.$transaction.mockResolvedValue([]);
  });

  it("creates checkout through the selected enabled gateway", async () => {
    const response = await buildApp().request("/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gateway: "stripe", plan: "PRO", interval: "month" }),
    });

    expect(response.status).toBe(200);
    expect(mockCreateCheckout).toHaveBeenCalledWith(
      "stripe",
      "PRO",
      expect.objectContaining({ businessProfileId: "workspace_1", email: "payer@example.com" }),
      "month",
      expect.objectContaining({ mode: "test", gateway: "stripe" }),
    );
    expect(mockDb.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ provider: "stripe", providerCheckoutId: "cs_test_123" }),
      }),
    );
  });

  it("rejects checkout without an explicit billing interval", async () => {
    const response = await buildApp().request("/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gateway: "stripe", plan: "PRO" }),
    });
    expect(response.status).toBe(400);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("explains Dodo merchant activation failures without changing the workspace subscription", async () => {
    mockDb.paymentGateway.findUnique.mockResolvedValue({
      key: "dodo",
      name: "Dodo Payments",
      enabled: true,
      config: { mode: "live" },
    });
    mockCreateCheckout.mockRejectedValueOnce(
      Object.assign(new Error("403 Live payments not enabled for merchant"), { status: 403 }),
    );
    const response = await buildApp().request("/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gateway: "dodo", plan: "PRO", interval: "month" }),
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toEqual({
      code: "merchant_live_payments_unavailable",
      message:
        "Live checkout is temporarily unavailable because Dodo Payments has not activated payments for this merchant. Please contact billing support.",
    });
    expect(mockDb.subscription.upsert).not.toHaveBeenCalled();
    expect(mockDb.businessProfile.update).not.toHaveBeenCalled();
  });

  it("preserves unrelated provider failures", async () => {
    mockCreateCheckout.mockRejectedValueOnce(
      Object.assign(new Error("403 Access denied"), { status: 403 }),
    );
    const response = await buildApp().request("/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gateway: "stripe", plan: "PRO", interval: "month" }),
    });
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("provider_error");
    expect(mockDb.subscription.upsert).not.toHaveBeenCalled();
  });

  it("does not reuse a pending checkout from a different mode", async () => {
    mockDb.paymentGateway.findUnique.mockResolvedValue({
      key: "stripe",
      enabled: true,
      config: { mode: "live" },
    });
    mockDb.subscription.findUnique.mockResolvedValue({
      provider: "stripe",
      billingMode: "test",
      status: "open",
      shortUrl: "https://test-checkout",
      providerSubscriptionId: null,
    });
    const response = await buildApp().request("/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gateway: "stripe", plan: "PRO", interval: "month" }),
    });
    expect(response.status).toBe(409);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("verifies Stripe webhooks with the selected mode secret and namespaces deliveries", async () => {
    mockGetIntegration.mockImplementation(async (key: string) =>
      key === "stripe_live_webhook_secret" ? "whsec_live" : null,
    );
    const constructEvent = vi
      .fn()
      .mockReturnValue({ id: "evt_same", type: "unhandled", livemode: true, data: { object: {} } });
    mockStripeClient.mockResolvedValue({ webhooks: { constructEvent } });
    const response = await buildApp().request("/billing/webhooks/stripe?mode=live", {
      method: "POST",
      headers: { "stripe-signature": "live_signature" },
      body: "signed_payload",
    });
    expect(response.status).toBe(200);
    expect(constructEvent).toHaveBeenCalledWith("signed_payload", "live_signature", "whsec_live");
    expect(mockStripeClient).toHaveBeenCalledWith(expect.objectContaining({ mode: "live" }));
    expect(mockDb.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "stripe:live", externalId: "evt_same" }),
      }),
    );
  });

  it("rejects a signed live Stripe event on the test endpoint", async () => {
    mockGetIntegration.mockResolvedValue("whsec_test");
    mockStripeClient.mockResolvedValue({
      webhooks: { constructEvent: () => ({ id: "evt_live", livemode: true }) },
    });
    const response = await buildApp().request("/billing/webhooks/stripe?mode=test", {
      method: "POST",
      body: "signed_payload",
    });
    expect(response.status).toBe(400);
    expect(mockDb.webhookDelivery.create).not.toHaveBeenCalled();
  });

  it("retries Stripe processing after a failed delivery instead of acknowledging it", async () => {
    mockGetIntegration.mockResolvedValue("whsec_test");
    mockStripeClient.mockResolvedValue({
      webhooks: {
        constructEvent: () => ({
          id: "evt_retry",
          type: "invoice.payment_failed",
          data: { object: { id: "invoice_1" } },
        }),
      },
    });
    mockDb.payment.updateMany.mockRejectedValueOnce(new Error("Temporary database outage"));
    const request = () => buildApp().request("/billing/webhooks/stripe", {
      method: "POST", body: "signed_payload",
    });
    expect((await request()).status).toBe(500);
    mockDb.webhookDelivery.findUnique.mockResolvedValue({
      id: "delivery_1", status: "failed", attemptedAt: new Date(Date.now() - 1000),
    });
    mockDb.payment.updateMany.mockResolvedValue({ count: 1 });
    expect((await request()).status).toBe(200);
    expect(mockDb.payment.updateMany).toHaveBeenCalledTimes(2);
  });

  it.each(["stripe", "dodo"])("does not acknowledge a %s delivery that is still processing", async (gateway) => {
    mockGetIntegration.mockResolvedValue("whsec_test");
    mockStripeClient.mockResolvedValue({ webhooks: { constructEvent: () => ({
      id: "evt_busy", type: "unhandled", data: { object: {} },
    }) } });
    mockDodoClient.mockResolvedValue({ webhooks: { unwrap: () => ({ type: "unhandled" }) } });
    mockDb.webhookDelivery.findUnique.mockResolvedValue({
      id: "delivery_1", status: "received", attemptedAt: new Date(),
    });
    const response = await buildApp().request(`/billing/webhooks/${gateway}`, {
      method: "POST", headers: { "webhook-id": "evt_busy" }, body: "signed_payload",
    });
    expect(response.status).toBe(503);
    expect(mockDb.webhookDelivery.create).not.toHaveBeenCalled();
    expect(mockDb.webhookDelivery.updateMany).not.toHaveBeenCalled();
  });

  it("ignores test Stripe subscription events when the workspace has a live subscription", async () => {
    mockGetIntegration.mockResolvedValue("whsec_test");
    mockStripeClient.mockResolvedValue({
      webhooks: {
        constructEvent: () => ({
          id: "evt_test",
          livemode: false,
          type: "customer.subscription.deleted",
          data: { object: { id: "sub_test", status: "canceled" } },
        }),
      },
    });
    mockDb.subscription.findUnique.mockResolvedValue({
      provider: "stripe",
      billingMode: "live",
      businessProfileId: "workspace_1",
      providerSubscriptionId: "sub_live",
    });
    const response = await buildApp().request("/billing/webhooks/stripe?mode=test", {
      method: "POST",
      body: "signed_payload",
    });
    expect(response.status).toBe(200);
    expect(mockDb.businessProfile.update).not.toHaveBeenCalled();
    expect(mockDb.subscription.upsert).not.toHaveBeenCalled();
  });

  it("ignores test Dodo events when the workspace has a live subscription", async () => {
    mockDodoClient.mockResolvedValue({
      webhooks: {
        unwrap: () => ({
          type: "subscription.cancelled",
          data: {
            subscription_id: "sub_test",
            status: "cancelled",
            metadata: { businessProfileId: "workspace_1" },
          },
        }),
      },
    });
    mockDb.subscription.findUnique.mockResolvedValue({
      provider: "dodo",
      billingMode: "live",
      businessProfileId: "workspace_1",
      providerSubscriptionId: "sub_live",
    });
    const response = await buildApp().request("/billing/webhooks/dodo?mode=test", {
      method: "POST",
      headers: { "webhook-id": "evt_test" },
      body: "signed_payload",
    });
    expect(response.status).toBe(200);
    expect(mockDb.businessProfile.update).not.toHaveBeenCalled();
    expect(mockDb.subscription.upsert).not.toHaveBeenCalled();
  });

  it("rejects a disabled gateway", async () => {
    mockDb.paymentGateway.findUnique.mockResolvedValueOnce({
      key: "dodo",
      name: "Dodo Payments",
      enabled: false,
    });
    const response = await buildApp().request("/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gateway: "dodo", plan: "PRO", interval: "month" }),
    });
    expect(response.status).toBe(503);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("does not start checkout until required credentials and product IDs exist", async () => {
    mockReadiness.mockResolvedValueOnce({ ready: false });
    const response = await buildApp().request("/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gateway: "stripe", plan: "PRO", interval: "month" }),
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("gateway_not_configured");
  });

  it.each(["month", "year"])("passes the selected %s interval to checkout", async (interval) => {
    const res = await buildApp().request("/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gateway: "stripe", plan: "PRO", interval }),
    });
    expect(res.status).toBe(200);
    expect(mockCreateCheckout).toHaveBeenCalledWith(
      "stripe",
      "PRO",
      expect.any(Object),
      interval,
      expect.objectContaining({ mode: "test" }),
    );
  });

  it("rejects an unconfigured interval before contacting the provider", async () => {
    mockConfiguredProduct.mockResolvedValue(null);
    const res = await buildApp().request("/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gateway: "stripe", plan: "PRO", interval: "year" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("billing_interval_unavailable");
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("does not reuse a monthly checkout when yearly is selected", async () => {
    mockDb.subscription.findUnique.mockResolvedValue({
      provider: "stripe",
      status: "open",
      shortUrl: "https://checkout.test/month",
      providerProductId: "price_month",
      providerSubscriptionId: null,
    });
    const res = await buildApp().request("/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gateway: "stripe", plan: "PRO", interval: "year" }),
    });
    expect(res.status).toBe(409);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("resumes an existing checkout for the same selected product", async () => {
    mockDb.subscription.findUnique.mockResolvedValue({
      provider: "stripe",
      status: "open",
      shortUrl: "https://checkout.test/year",
      providerProductId: "price_year",
      providerSubscriptionId: null,
    });
    const res = await buildApp().request("/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gateway: "stripe", plan: "PRO", interval: "year" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.checkoutUrl).toBe("https://checkout.test/year");
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("rejects an unsupported billing interval", async () => {
    const res = await buildApp().request("/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gateway: "stripe", plan: "PRO", interval: "week" }),
    });
    expect(res.status).toBe(400);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it.each([false, true])("preserves a concurrent cancellation webhook when the provider request fails=%s", async (fails) => {
    const subscription = {
      id: "sub_local", provider: "stripe", billingMode: "test", status: "active",
      providerSubscriptionId: "sub_1", cancelAtPeriodEnd: false,
    };
    let current = { ...subscription };
    mockDb.subscription.findUnique.mockImplementation(async () => ({ ...current }));
    mockDb.subscription.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.status !== current.status) return { count: 0 };
      Object.assign(current, data);
      return { count: 1 };
    });
    mockDb.subscription.update.mockImplementation(async ({ data }) => Object.assign(current, data));
    mockCancel.mockImplementationOnce(async () => {
      current.status = "canceled"; // A webhook finishes while the provider call is in flight.
      current.cancelAtPeriodEnd = true;
      if (fails) throw new Error("Response was lost");
      return { status: "active", cancelAtPeriodEnd: true };
    });
    const response = await buildApp().request("/billing/cancel", { method: "POST" });
    expect(response.status).toBe(fails ? 502 : 200);
    expect(current.status).toBe("canceled");
    expect(current.cancelAtPeriodEnd).toBe(true);
  });

  it("links a successful Dodo payment to its checkout before the subscription webhook arrives", async () => {
    mockDodoClient.mockResolvedValue({
      webhooks: {
        unwrap: () => ({
          type: "payment.succeeded",
          data: {
            payment_id: "pay_1",
            subscription_id: "dodo_sub_1",
            checkout_session_id: "checkout_1",
            total_amount: 1234,
            currency: "KWD",
            metadata: {},
          },
        }),
      },
    });
    mockDb.subscription.findFirst.mockResolvedValue({
      id: "sub_local",
      userId: "user_1",
      businessProfileId: "workspace_1",
      providerSubscriptionId: null,
    });
    mockDb.subscription.update.mockResolvedValue({
      id: "sub_local",
      userId: "user_1",
      businessProfileId: "workspace_1",
      providerSubscriptionId: "dodo_sub_1",
    });

    const response = await buildApp().request("/billing/webhooks/dodo", {
      method: "POST",
      headers: { "webhook-id": "evt_1" },
      body: "signed-payload",
    });

    expect(response.status).toBe(200);
    expect(mockDb.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { providerSubscriptionId: "dodo_sub_1", status: "active" },
      }),
    );
    expect(mockDb.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: "dodo",
          providerPaymentId: "pay_1",
          amount: 1.234,
          businessProfileId: "workspace_1",
        }),
      }),
    );
  });

  it("retries a previously failed Dodo webhook delivery", async () => {
    mockDodoClient.mockResolvedValue({
      webhooks: { unwrap: () => ({ type: "payment.failed", data: { payment_id: "pay_2" } }) },
    });
    mockDb.webhookDelivery.findUnique.mockResolvedValue({ id: "delivery_1", status: "failed", attemptedAt: new Date(0) });
    mockDb.payment.updateMany.mockResolvedValue({ count: 1 });

    const response = await buildApp().request("/billing/webhooks/dodo", {
      method: "POST",
      headers: { "webhook-id": "evt_2" },
      body: "signed-payload",
    });

    expect(response.status).toBe(200);
    expect(mockDb.webhookDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "delivery_1", status: "failed" }) }),
    );
    expect(mockDb.payment.updateMany).toHaveBeenCalledOnce();
  });

  it("reclaims a Dodo webhook left in progress after a server interruption", async () => {
    mockDodoClient.mockResolvedValue({
      webhooks: { unwrap: () => ({ type: "payment.failed", data: { payment_id: "pay_2" } }) },
    });
    mockDb.webhookDelivery.findUnique.mockResolvedValue({
      id: "delivery_1",
      status: "received",
      attemptedAt: new Date(Date.now() - 10 * 60_000),
    });
    mockDb.payment.updateMany.mockResolvedValue({ count: 1 });

    const response = await buildApp().request("/billing/webhooks/dodo", {
      method: "POST",
      headers: { "webhook-id": "evt_stale" },
      body: "signed-payload",
    });

    expect(response.status).toBe(200);
    expect(mockDb.webhookDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "delivery_1", status: "received" }),
      }),
    );
  });

  it("rejects an invalid Dodo webhook signature before writing a delivery", async () => {
    mockDodoClient.mockResolvedValue({
      webhooks: {
        unwrap: () => {
          throw new Error("Invalid signature");
        },
      },
    });

    const response = await buildApp().request("/billing/webhooks/dodo", {
      method: "POST",
      headers: { "webhook-id": "evt_invalid" },
      body: "unsigned-payload",
    });

    expect(response.status).toBe(400);
    expect(mockDb.webhookDelivery.create).not.toHaveBeenCalled();
  });

  it("updates access when Dodo cancels a subscription", async () => {
    mockDodoClient.mockResolvedValue({
      webhooks: {
        unwrap: () => ({
          type: "subscription.cancelled",
          data: {
            subscription_id: "dodo_sub_1",
            status: "cancelled",
            next_billing_date: "2020-01-01T00:00:00Z",
            metadata: { userId: "user_1", businessProfileId: "workspace_1" },
          },
        }),
      },
    });
    mockDb.subscription.findUnique
      .mockResolvedValueOnce({ businessProfileId: "workspace_1" })
      .mockResolvedValueOnce({ provider: "dodo", providerSubscriptionId: "dodo_sub_1" });

    const response = await buildApp().request("/billing/webhooks/dodo", {
      method: "POST",
      headers: { "webhook-id": "evt_cancelled" },
      body: "signed-payload",
    });

    expect(response.status).toBe(200);
    expect(mockDb.businessProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { plan: "FREE" } }),
    );
  });

  it("ignores a late event from an older Dodo subscription", async () => {
    mockDodoClient.mockResolvedValue({
      webhooks: {
        unwrap: () => ({
          type: "subscription.cancelled",
          data: { subscription_id: "old_sub", status: "cancelled", metadata: {} },
        }),
      },
    });
    mockDb.subscription.findUnique
      .mockResolvedValueOnce({ businessProfileId: "workspace_1" })
      .mockResolvedValueOnce({ provider: "dodo", providerSubscriptionId: "new_sub" });

    const response = await buildApp().request("/billing/webhooks/dodo", {
      method: "POST",
      headers: { "webhook-id": "evt_old_cancelled" },
      body: "signed-payload",
    });

    expect(response.status).toBe(200);
    expect(mockDb.businessProfile.update).not.toHaveBeenCalled();
  });

  it("reconciles partial Dodo refunds from the provider payment", async () => {
    mockDodoClient.mockResolvedValue({
      webhooks: {
        unwrap: () => ({ type: "refund.succeeded", data: { payment_id: "pay_1" } }),
      },
      payments: {
        retrieve: vi.fn().mockResolvedValue({
          payment_id: "pay_1",
          status: "succeeded",
          refund_status: "partial",
          refunds: [
            { status: "succeeded", amount: 250 },
            { status: "failed", amount: 100 },
          ],
        }),
      },
    });
    mockDb.payment.findUnique.mockResolvedValue({
      id: "payment_local",
      amount: 12,
      currency: "USD",
    });

    const response = await buildApp().request("/billing/webhooks/dodo", {
      method: "POST",
      headers: { "webhook-id": "evt_refund_1" },
      body: "signed-payload",
    });

    expect(response.status).toBe(200);
    expect(mockDb.payment.update).toHaveBeenCalledWith({
      where: { id: "payment_local" },
      data: { refundedAmount: 2.5, status: "partially_refunded" },
    });
  });

  it("keeps a refunded ledger entry refunded if its payment event arrives later", async () => {
    mockDodoClient.mockResolvedValue({
      webhooks: {
        unwrap: () => ({
          type: "payment.succeeded",
          data: {
            payment_id: "pay_1",
            subscription_id: "dodo_sub_1",
            total_amount: 1200,
            currency: "USD",
          },
        }),
      },
    });
    mockDb.subscription.findUnique.mockResolvedValue({
      id: "sub_local",
      userId: "user_1",
      businessProfileId: "workspace_1",
      providerSubscriptionId: "dodo_sub_1",
    });
    mockDb.payment.findUnique.mockResolvedValue({ status: "refunded" });

    const response = await buildApp().request("/billing/webhooks/dodo", {
      method: "POST",
      headers: { "webhook-id": "evt_pay_late" },
      body: "signed-payload",
    });

    expect(response.status).toBe(200);
    expect(mockDb.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: "refunded" }) }),
    );
  });
});


describe("audit fixtures against baseline checkout and ordering", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDb.paymentGateway.findUnique.mockResolvedValue({ key: "stripe", name: "Stripe", enabled: true });
    mockReadiness.mockResolvedValue({ ready: true });
    mockConfiguredProduct.mockResolvedValue("price_pro");
    mockDb.subscription.findUnique.mockResolvedValue(null);
    mockDb.user.findUnique.mockResolvedValue({ email: "fixture@example.test" });
    mockDb.subscription.upsert.mockResolvedValue({ id: "sub_local" });
    mockCreateCheckout.mockResolvedValue({ checkoutId: "cs_fixture", checkoutUrl: "https://checkout.example.test/fixture", providerProductId: "price_pro", status: "open" });
    mockDb.webhookDelivery.findUnique.mockResolvedValue(null);
    mockDb.webhookDelivery.create.mockResolvedValue({ id: "delivery_fixture" });
    mockDb.webhookDelivery.update.mockResolvedValue({});
    mockDb.webhookDelivery.updateMany.mockResolvedValue({ count: 1 });
    mockDb.$transaction.mockResolvedValue([]);
  });
  const checkout = () => buildApp().request("/billing/checkout", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ gateway: "stripe", plan: "PRO", interval: "month" }),
  });
  it("audit fixture: concurrent checkout must contact the provider at most once", async () => {
    const responses = await Promise.all([checkout(), checkout()]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(mockCreateCheckout).toHaveBeenCalledTimes(1);
  });
  it("audit fixture: an entitled past_due subscription must block a second checkout", async () => {
    mockDb.subscription.findUnique.mockResolvedValue({ id: "sub_existing", provider: "stripe", status: "past_due", providerSubscriptionId: "sub_live", billingMode: "test" });
    const response = await checkout();
    expect(response.status).toBe(409);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });
  it("audit fixture: an older event must not restore a canceled subscription", async () => {
    mockGetIntegration.mockResolvedValue("whsec_fixture");
    mockDb.subscription.findUnique.mockResolvedValue({ id: "sub_local", provider: "stripe", status: "canceled", providerSubscriptionId: "sub_1", businessProfileId: "workspace_1", billingMode: "test" });
    mockStripeClient.mockResolvedValue({ webhooks: { constructEvent: () => ({ id: "evt_old_active", type: "customer.subscription.updated", created: 1, livemode: false, data: { object: { id: "sub_1", status: "active", metadata: {}, current_period_end: 2000000000 } } }) } });
    const response = await buildApp().request("/billing/webhooks/stripe", { method: "POST", body: "signed_fixture" });
    expect(response.status).toBe(200);
    expect(mockDb.businessProfile.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { plan: "PRO" } }));
  });
});


describe("audit fixtures for late payment failure ordering", () => {
  it.each(["captured", "refunded"])("audit fixture: a late Dodo failure must preserve %s ledger state", async (priorStatus) => {
    vi.resetAllMocks();
    mockDb.paymentGateway.findUnique.mockResolvedValue({ key: "dodo", enabled: true });
    mockDb.webhookDelivery.findUnique.mockResolvedValue(null);
    mockDb.webhookDelivery.create.mockResolvedValue({ id: "delivery_1" });
    mockDb.webhookDelivery.update.mockResolvedValue({});
    mockDb.webhookDelivery.updateMany.mockResolvedValue({ count: 1 });
    mockDodoClient.mockResolvedValue({ webhooks: { unwrap: () => ({ type: "payment.failed", data: { payment_id: "pay_1" } }) } });
    let ledgerStatus=priorStatus;
    mockDb.payment.updateMany.mockImplementation(async ({ where, data }) => {
      if (!where.status || where.status === ledgerStatus) ledgerStatus=data.status;
      return { count: 1 };
    });
    const response = await buildApp().request("/billing/webhooks/dodo", { method: "POST", headers: { "webhook-id": "evt_late_failure" }, body: "signed_fixture" });
    expect(response.status).toBe(200);
    expect(ledgerStatus).toBe(priorStatus);
  });
});
