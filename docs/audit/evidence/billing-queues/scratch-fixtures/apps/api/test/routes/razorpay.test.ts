import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetIntegration = vi.fn();
const mockRecordIntegrationTest = vi.fn();
const mockTrackEvent = vi.fn();
const mockCreateOrder = vi.fn();
const mockFetchPayment = vi.fn();
const mockSubscriptionsCreate = vi.fn();
const mockSubscriptionsCancel = vi.fn();
const mockVerifyRazorpayCheckout = vi.fn();
const mockVerifyRazorpaySignature = vi.fn();

// Mock the Razorpay class constructor
vi.mock("razorpay", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      subscriptions: {
        create: (...args: unknown[]) => mockSubscriptionsCreate(...args),
        cancel: (...args: unknown[]) => mockSubscriptionsCancel(...args),
      },
      orders: { create: (...args: unknown[]) => mockCreateOrder(...args) },
      payments: { fetch: (...args: unknown[]) => mockFetchPayment(...args) },
    })),
  };
});

vi.mock("@actorconsole/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@actorconsole/shared")>()),
  verifyRazorpayCheckout: (...args: unknown[]) => mockVerifyRazorpayCheckout(...args),
  verifyRazorpaySignature: (...args: unknown[]) => mockVerifyRazorpaySignature(...args),
  getLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

vi.mock("@actorconsole/db", () => ({
  db: {
    subscription: {
      upsert: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    payment: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    webhookDelivery: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "delivery_1" }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      update: vi.fn().mockResolvedValue({}),
    },
    businessProfile: {
      findFirst: vi.fn().mockResolvedValue({ id: "workspace_1" }),
      update: vi.fn().mockResolvedValue({}),
    },
    paymentGateway: {
      findUnique: vi.fn().mockResolvedValue({ key: "razorpay", enabled: true }),
    },
  },
}));

vi.mock("../../src/lib/integrations.js", () => ({
  getIntegration: (...args: unknown[]) => mockGetIntegration(...args),
  recordIntegrationTest: (...args: unknown[]) => mockRecordIntegrationTest(...args),
}));

vi.mock("../../src/lib/analytics.js", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock("../../src/middleware/auth.js", () => ({
  requireAuth: () => async (c: any, next: any) => {
    c.set("session", {
      userId: "u1",
      email: "test@test.com",
      plan: "FREE",
      businessProfileId: "workspace_1",
    });
    await next();
  },
}));

import { razorpayRoutes } from "../../src/routes/razorpay.js";

function buildApp() {
  const app = new Hono();
  app.onError(onErrorHandler);
  // Inject session before the route runs (mirrors requireAuth from app.ts)
  app.use("*", async (c: any, next: any) => {
    c.set("session", {
      userId: "u1",
      email: "test@test.com",
      plan: "FREE",
      businessProfileId: "workspace_1",
    });
    await next();
  });
  app.route("/razorpay", razorpayRoutes);
  return app;
}

describe("Razorpay routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: Razorpay is configured
    mockGetIntegration.mockImplementation(async (key: string) => {
      if (key === "razorpay_key_id") return "rzp_test_123";
      if (key === "razorpay_key_secret") return "secret";
      if (key === "razorpay_plan_id_pro_month") return "plan_pro_123";
      if (key === "razorpay_plan_id_pro_year") return "plan_year_123";
      if (key === "razorpay_product_credits_100_amount_paise") return "5000";
      return null;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /razorpay/create-subscription", () => {
    it("requires an explicit monthly or yearly interval on the older endpoint", async () => {
      const response = await buildApp().request("/razorpay/create-subscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: "PRO" }),
      });
      expect(response.status).toBe(400);
      expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    });
    it.each(["month", "year"])(
      "creates a subscription for the selected %s PRO plan",
      async (interval) => {
        mockSubscriptionsCreate.mockResolvedValueOnce({
          id: "sub_123",
          short_url: "https://rzp.io/test",
          status: "created",
        });

        const res = await buildApp().request("/razorpay/create-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: "PRO", interval }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.shortUrl).toBe("https://rzp.io/test");
        expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            plan_id: interval === "year" ? "plan_year_123" : "plan_pro_123",
            notes: expect.objectContaining({
              businessProfileId: "workspace_1",
              plan: "PRO",
              billingInterval: interval,
            }),
          }),
        );
      },
    );

    it("returns 400 for invalid plan", async () => {
      const res = await buildApp().request("/razorpay/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "INVALID" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects removed plan values", async () => {
      const res = await buildApp().request("/razorpay/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "STUDIO" }),
      });
      expect(res.status).toBe(400);
      expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    });

    it("does not replace an admin-managed workspace plan", async () => {
      const { db } = await import("@actorconsole/db");
      (db.subscription.findUnique as any).mockResolvedValueOnce({
        id: "manual_sub_1",
        businessProfileId: "workspace_1",
        provider: "manual",
        razorpaySubscriptionId: null,
        status: "active",
      });

      const res = await buildApp().request("/razorpay/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "PRO", interval: "month" }),
      });

      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({
        error: { code: "admin_managed_subscription" },
      });
      expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    });

    it("returns 503 when Razorpay is not configured", async () => {
      mockGetIntegration.mockResolvedValue(null);
      const res = await buildApp().request("/razorpay/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "PRO", interval: "month" }),
      });
      expect(res.status).toBe(503);
    });
  });

  it("does not expose the removed one-off credit checkout surface", async () => {
    expect((await buildApp().request("/razorpay/create-order", { method: "POST" })).status).toBe(
      404,
    );
    expect((await buildApp().request("/razorpay/verify-checkout", { method: "POST" })).status).toBe(
      404,
    );
  });

  describe("POST /razorpay/cancel-subscription", () => {
    it("does not send another cancellation when period-end cancellation is already scheduled", async () => {
      const { db } = await import("@actorconsole/db");
      vi.mocked(db.subscription.findUnique).mockResolvedValueOnce({
        id: "sub_1", provider: "razorpay", razorpaySubscriptionId: "sub_rzp_1",
        status: "active", cancelAtPeriodEnd: true,
      } as never);
      vi.mocked(db.subscription.updateMany).mockResolvedValueOnce({ count: 1 });
      mockSubscriptionsCancel.mockResolvedValueOnce({ status: "active" });
      const response = await buildApp().request("/razorpay/cancel-subscription", { method: "POST" });
      expect(response.status).toBe(409);
      expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
    });
    it("cancels the active subscription", async () => {
      // The route calls db.subscription.findUnique — return a fake sub
      const { db } = await import("@actorconsole/db");
      (db.subscription.findUnique as any).mockResolvedValueOnce({
        id: "sub_db_123",
        userId: "u1",
        razorpaySubscriptionId: "sub_rzp_123",
        status: "active",
      });
      (db.subscription.updateMany as any).mockResolvedValueOnce({ count: 1 });
      mockSubscriptionsCancel.mockResolvedValueOnce({ status: "cancelled" });

      const res = await buildApp().request("/razorpay/cancel-subscription", {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });

  it("retries a failed Razorpay webhook rather than dropping its side effects", async () => {
    const { db } = await import("@actorconsole/db");
    mockGetIntegration.mockResolvedValue("fixture_webhook_secret");
    mockVerifyRazorpaySignature.mockReturnValue(true);
    vi.mocked(db.webhookDelivery.findUnique).mockResolvedValue({
      id: "delivery_retry", status: "failed", attemptedAt: new Date(0),
    } as never);
    vi.mocked(db.webhookDelivery.updateMany).mockResolvedValue({ count: 1 });
    const response = await buildApp().request("/razorpay/webhook", {
      method: "POST",
      headers: { "x-razorpay-signature": "fixture_signature", "x-razorpay-event-id": "event_retry" },
      body: JSON.stringify({ event: "payment.failed", payload: { payment: { entity: { id: "pay_1", order_id: "order_1" } } } }),
    });
    expect(response.status).toBe(200);
    expect(db.payment.updateMany).toHaveBeenCalledOnce();
  });
});


describe("audit fixtures against baseline Razorpay ledger", () => {
  it("audit fixture: records the provider currency and its minor-unit exponent", async () => {
    const { db } = await import("@actorconsole/db");
    vi.resetAllMocks();
    mockGetIntegration.mockResolvedValue("fixture_secret");
    mockVerifyRazorpaySignature.mockReturnValue(true);
    vi.mocked(db.paymentGateway.findUnique).mockResolvedValue({ key: "razorpay", enabled: true } as never);
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ id: "sub_local", provider: "razorpay", billingMode: "test", razorpaySubscriptionId: "sub_1", userId: "u1", businessProfileId: "workspace_1" } as never);
    vi.mocked(db.businessProfile.findFirst).mockResolvedValue({ id: "workspace_1" } as never);
    vi.mocked(db.webhookDelivery.findUnique).mockResolvedValue(null);
    vi.mocked(db.webhookDelivery.create).mockResolvedValue({ id: "delivery_1" } as never);
    vi.mocked(db.payment.findUnique).mockResolvedValue(null);
    (db as any).$transaction = vi.fn().mockResolvedValue([]);
    const response = await buildApp().request("/razorpay/webhook", {
      method: "POST", headers: { "x-razorpay-event-id": "evt_currency", "x-razorpay-signature": "fixture_signature" },
      body: JSON.stringify({ event: "subscription.charged", payload: {
        subscription: { entity: { id: "sub_1", status: "active", notes: { userId: "u1", businessProfileId: "workspace_1" } } },
        payment: { entity: { id: "pay_1", order_id: "order_1", amount: 12345, currency: "KWD", status: "captured" } },
      } }),
    });
    expect(response.status).toBe(200);
    expect(db.payment.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ amount: 12.345, currency: "KWD" }) }));
  });
});
