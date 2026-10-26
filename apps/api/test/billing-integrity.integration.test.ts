import { randomUUID, createHmac } from "node:crypto";
import { Queue } from "bullmq";
import {
  dispatchPendingActorStatusOperations,
  claimActorStatusOperation,
} from "../../worker/src/lib/operation-dispatch.js";
import { bulkActorStatusJobId } from "@actorconsole/shared";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@actorconsole/db";

const provider = vi.hoisted(() => ({
  retrieve: vi.fn(),
  checkout: vi.fn(),
  cancel: vi.fn(),
  event: {} as any,
}));
vi.mock("../src/lib/billing-providers.js", () => ({
  retrieveProviderSubscription: provider.retrieve,
  createProviderCheckout: provider.checkout,
  cancelProviderSubscription: provider.cancel,
  configuredCheckoutProduct: vi.fn().mockResolvedValue("price_fixture"),
  gatewayReadiness: vi.fn().mockResolvedValue({ ready: true }),
  getStripeClient: vi
    .fn()
    .mockImplementation(async () => ({ webhooks: { constructEvent: () => provider.event } })),
  getDodoClient: vi
    .fn()
    .mockImplementation(async () => ({ webhooks: { unwrap: () => provider.event } })),
  getRazorpayClient: vi.fn().mockResolvedValue({}),
}));
vi.mock("../src/lib/payment-gateway-settings.js", () => ({
  getGatewayContext: async (gateway: string) => ({ gateway, mode: "test", legacyFallback: false }),
  paymentWebhookContext: async (gateway: string) => ({
    gateway,
    mode: "test",
    legacyFallback: false,
  }),
  getPaymentSetting: async () => "fixture-secret",
  subscriptionMatchesMode: async (row: any, context: any) =>
    !row || row.billingMode === context.mode,
  legacyGatewayMode: async () => "test",
}));
vi.mock("../src/lib/analytics.js", () => ({ trackEvent: vi.fn() }));
import {
  reserveBillingCheckout,
  completeBillingCheckout,
  failBillingCheckout,
} from "../src/lib/billing-checkout-operations.js";
import { reconcileBillingSubscription } from "../src/lib/billing-state.js";
import {
  claimPaymentWebhook,
  completePaymentWebhook,
  failPaymentWebhook,
} from "../src/lib/payment-webhook-delivery.js";
import { reconcileExpiredSubscriptions } from "../../worker/src/lib/subscription-expiry.js";
import { billingRoutes } from "../src/routes/billing.js";
import { razorpayRoutes } from "../src/routes/razorpay.js";
import { onErrorHandler } from "../src/middleware/error.js";

const target = process.env.ACTORCONSOLE_BILLING_TEST_DATABASE_URL;
const enabled =
  !!target &&
  target === process.env.DATABASE_URL &&
  /^mysql:\/\/[^/]+@(localhost|127\.0\.0\.1):\d+\/actorconsole_billing_test$/.test(target);

describe.skipIf(!enabled)(
  "billing integrity against disposable MySQL (all providers mocked)",
  () => {
    const suffix = randomUUID();
    const userId = `billing-audit-${suffix}`;
    const workspaceId = `billing-wp-${suffix}`;
    const context = { gateway: "stripe" as const, mode: "test" as const, legacyFallback: false };
    const reservation = () =>
      reserveBillingCheckout({
        businessProfileId: workspaceId,
        userId,
        context,
        productId: "price_fixture",
        interval: "month",
      });
    const checkout = {
      gateway: "stripe" as const,
      billingMode: "test" as const,
      checkoutId: "cs_fixture",
      checkoutUrl: "https://checkout.example.test/fixture",
      providerProductId: "price_fixture",
      status: "open",
    };
    const state = (status: string, metadata = {}) => ({
      id: "sub_fixture",
      status,
      periodEnd: new Date(0),
      cancelAtPeriodEnd: true,
      metadata,
    });
    const app = new Hono();
    app.onError(onErrorHandler);
    app.use("*", async (c, next) => {
      c.set(
        "session" as never,
        {
          userId,
          businessProfileId: workspaceId,
          email: "fixture@example.test",
          plan: "FREE",
        } as never,
      );
      await next();
    });
    app.route("/billing", billingRoutes);
    app.route("/razorpay", razorpayRoutes);
    const submit = (gateway = "stripe") =>
      app.request("/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gateway, plan: "PRO", interval: "month" }),
      });
    const lifecycle = () =>
      app.request("/billing/webhooks/stripe?mode=test", { method: "POST", body: "signed-fixture" });
    const seedSubscription = async (status = "active", gateway = "stripe") =>
      db.subscription.create({
        data: {
          userId,
          businessProfileId: workspaceId,
          provider: gateway,
          billingMode: "test",
          providerSubscriptionId: "sub_fixture",
          status,
          ...(gateway === "razorpay" ? { razorpaySubscriptionId: "sub_fixture" } : {}),
        },
      });

    beforeAll(async () => {
      await db.user.create({
        data: {
          id: userId,
          email: `${suffix}@example.test`,
          businessProfiles: {
            create: { id: workspaceId, name: "Billing fixture", slug: "billing" },
          },
        },
      });
      for (const key of ["stripe", "razorpay", "dodo"])
        await db.paymentGateway.upsert({
          where: { key },
          create: { key, name: key, enabled: true },
          update: { enabled: true },
        });
    });
    beforeEach(async () => {
      vi.clearAllMocks();
      provider.retrieve.mockReset();
      provider.checkout.mockReset();
      provider.cancel.mockReset();
      await db.bulkActorStatusOperation.deleteMany({ where: { userId } });
      await db.payment.deleteMany({ where: { userId } });
      await db.subscription.deleteMany({ where: { userId } });
      await db.billingCheckoutOperation.deleteMany({ where: { businessProfileId: workspaceId } });
      await db.webhookDelivery.deleteMany({ where: { externalId: { startsWith: suffix } } });
      await db.businessProfile.update({ where: { id: workspaceId }, data: { plan: "FREE" } });
      provider.checkout.mockResolvedValue(checkout);
      provider.retrieve.mockResolvedValue(state("canceled"));
      provider.event = {
        id: `${suffix}-event`,
        type: "customer.subscription.updated",
        livemode: false,
        data: {
          object: {
            id: "sub_fixture",
            status: "active",
            metadata: { userId, businessProfileId: workspaceId },
          },
        },
      };
    });
    afterAll(async () => {
      await db.payment.deleteMany({ where: { userId } });
      await db.subscription.deleteMany({ where: { userId } });
      await db.webhookDelivery.deleteMany({ where: { externalId: { startsWith: suffix } } });
      await db.user.delete({ where: { id: userId } });
      await db.$disconnect();
    });

    it("creates at most one provider checkout for two concurrent HTTP requests", async () => {
      const responses = await Promise.all([submit(), submit()]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(provider.checkout).toHaveBeenCalledTimes(1);
      expect(await db.subscription.count({ where: { businessProfileId: workspaceId } })).toBe(1);
    });
    it("shares the reservation across legacy and neutral checkout endpoints", async () => {
      provider.checkout.mockImplementation(async (_gateway, _plan, actor) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          ...checkout,
          gateway: "razorpay",
          providerSubscriptionId: `remote-${actor.operationId}`,
        };
      });
      const requests = await Promise.all([
        submit("razorpay"),
        app.request("/razorpay/create-subscription", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plan: "PRO", interval: "month" }),
        }),
      ]);
      expect(requests.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(provider.checkout).toHaveBeenCalledTimes(1);
    });
    it("does not create another checkout after an ambiguous provider timeout", async () => {
      provider.checkout.mockRejectedValue(new Error("Response lost after acceptance"));
      expect((await submit()).status).toBe(502);
      expect((await submit()).status).toBe(409);
      expect(provider.checkout).toHaveBeenCalledTimes(1);
      expect(
        (
          await db.billingCheckoutOperation.findUnique({
            where: { businessProfileId: workspaceId },
          })
        )?.status,
      ).toBe("UNKNOWN");
    });
    it("releases only a confirmed rejected request and prevents an old result from taking over", async () => {
      const first = await reservation();
      await failBillingCheckout(
        first,
        Object.assign(new Error("Invalid product"), { status: 400 }),
      );
      const second = await reservation();
      expect(second).not.toBe(first);
      await expect(completeBillingCheckout(first, checkout)).rejects.toThrow("unavailable");
      expect(
        (await db.subscription.findUnique({ where: { businessProfileId: workspaceId } }))
          ?.checkoutOperationId,
      ).toBe(second);
    });
    it("keeps a provider-accepted checkout reserved after a persistence failure", async () => {
      const operationId = await reservation();
      await expect(
        completeBillingCheckout(operationId, { ...checkout, checkoutId: "x".repeat(300) }),
      ).rejects.toThrow();
      await expect(reservation()).rejects.toMatchObject({ code: "checkout_in_progress" });
      expect(
        (await db.subscription.findUnique({ where: { businessProfileId: workspaceId } }))?.status,
      ).toBe("checkout_pending");
    });
    it("preserves a webhook that arrives before checkout completion", async () => {
      const operationId = await reservation();
      provider.retrieve.mockResolvedValue(
        state("active", {
          checkoutOperationId: operationId,
          userId,
          businessProfileId: workspaceId,
        }),
      );
      await reconcileBillingSubscription({
        context,
        id: "sub_fixture",
        businessProfileId: workspaceId,
        userId,
      });
      expect(
        (await db.billingCheckoutOperation.findUnique({ where: { id: operationId } }))?.status,
      ).toBe("SUCCEEDED");
      await completeBillingCheckout(operationId, checkout);
      expect(
        await db.subscription.findUnique({ where: { businessProfileId: workspaceId } }),
      ).toMatchObject({
        status: "active",
        providerSubscriptionId: "sub_fixture",
        providerCheckoutId: "cs_fixture",
      });
    });
    it.each(["past_due", "on_hold", "cancellation_pending"])(
      "does not create a replacement for %s",
      async (status) => {
        await seedSubscription(status);
        expect((await submit()).status).toBe(409);
        expect(provider.checkout).not.toHaveBeenCalled();
      },
    );
    it("ignores an old unlinked checkout after a different reservation has begun", async () => {
      const operationId = await reservation();
      provider.event = {
        id: `${suffix}-old-checkout`,
        type: "checkout.session.completed",
        livemode: false,
        data: {
          object: {
            id: "cs_old",
            status: "complete",
            payment_status: "unpaid",
            metadata: {
              userId,
              businessProfileId: workspaceId,
              checkoutOperationId: "old-operation",
            },
          },
        },
      };
      expect((await lifecycle()).status).toBe(200);
      expect(
        (await db.subscription.findUnique({ where: { businessProfileId: workspaceId } }))
          ?.checkoutOperationId,
      ).toBe(operationId);
      expect((await db.businessProfile.findUnique({ where: { id: workspaceId } }))?.plan).toBe(
        "FREE",
      );
    });
    it("does not replace a legacy Razorpay ID when the generic provider ID is absent", async () => {
      const sub = await seedSubscription("active", "razorpay");
      await db.subscription.update({
        where: { id: sub.id },
        data: { providerSubscriptionId: null },
      });
      const result = await reconcileBillingSubscription({
        context: { ...context, gateway: "razorpay" },
        id: "old_remote_id",
        businessProfileId: workspaceId,
        userId,
      });
      expect(result).toBeNull();
      expect(provider.retrieve).not.toHaveBeenCalled();
      expect(
        (await db.subscription.findUnique({ where: { id: sub.id } }))?.razorpaySubscriptionId,
      ).toBe("sub_fixture");
    });
    it("reconciles an old active event to the provider's current canceled state", async () => {
      await seedSubscription("canceled");
      await db.businessProfile.update({ where: { id: workspaceId }, data: { plan: "FREE" } });
      expect((await lifecycle()).status).toBe(200);
      expect((await db.businessProfile.findUnique({ where: { id: workspaceId } }))?.plan).toBe(
        "FREE",
      );
      expect(
        (await db.subscription.findUnique({ where: { businessProfileId: workspaceId } }))?.status,
      ).toBe("canceled");
    });
    it("rejects an older in-flight provider snapshot after another event commits", async () => {
      await seedSubscription();
      let release!: (value: any) => void;
      let fetched!: () => void;
      const began = new Promise<void>((resolve) => {
        fetched = resolve;
      });
      provider.retrieve.mockImplementationOnce(() => {
        fetched();
        return new Promise((resolve) => {
          release = resolve;
        });
      });
      const first = reconcileBillingSubscription({
        context,
        id: "sub_fixture",
        businessProfileId: workspaceId,
        userId,
      }).catch((error) => error);
      await began;
      await reconcileBillingSubscription({
        context,
        id: "sub_fixture",
        businessProfileId: workspaceId,
        userId,
      });
      release(state("active"));
      expect(await first).toBeInstanceOf(Error);
      expect((await db.businessProfile.findUnique({ where: { id: workspaceId } }))?.plan).toBe(
        "FREE",
      );
    });
    it("retries failed signed event processing and deduplicates its completed result", async () => {
      await seedSubscription();
      provider.retrieve.mockRejectedValueOnce(new Error("Temporary provider outage"));
      expect((await lifecycle()).status).toBe(500);
      expect((await lifecycle()).status).toBe(200);
      expect(await (await lifecycle()).json()).toMatchObject({ duplicate: true });
      expect(provider.retrieve).toHaveBeenCalledTimes(2);
    });
    it("fences simultaneous delivery claims using actual database timestamps", async () => {
      const input = {
        source: "stripe:test",
        externalId: `${suffix}-claim`,
        eventType: "unhandled",
        payload: {},
      };
      const claims = await Promise.all([claimPaymentWebhook(input), claimPaymentWebhook(input)]);
      expect(claims.filter((claim) => claim.state === "claimed")).toHaveLength(1);
      const first = claims.find((claim) => claim.state === "claimed")!;
      if (first.state !== "claimed") throw new Error("Expected a delivery owner");
      await failPaymentWebhook(first.lease, new Error("Interrupted"));
      const next = await claimPaymentWebhook(input);
      if (next.state !== "claimed") throw new Error("Expected retry owner");
      await expect(completePaymentWebhook(first.lease)).rejects.toThrow("lease changed");
      await completePaymentWebhook(next.lease);
      expect(await claimPaymentWebhook(input)).toEqual({ state: "duplicate" });
    });
    it.each(["canceled", "unpaid", "incomplete_expired", "paused"])(
      "expires the recorded Stripe %s period",
      async (status) => {
        const sub = await seedSubscription(status);
        await db.subscription.update({
          where: { id: sub.id },
          data: { currentPeriodEnd: new Date(0) },
        });
        await db.businessProfile.update({ where: { id: workspaceId }, data: { plan: "PRO" } });
        expect(await reconcileExpiredSubscriptions()).toBe(1);
        expect((await db.businessProfile.findUnique({ where: { id: workspaceId } }))?.plan).toBe(
          "FREE",
        );
      },
    );
    it("does not let an expiry scan downgrade a newer renewal", async () => {
      const sub = await seedSubscription("canceled");
      await db.subscription.update({
        where: { id: sub.id },
        data: { currentPeriodEnd: new Date(0) },
      });
      await db.businessProfile.update({ where: { id: workspaceId }, data: { plan: "PRO" } });
      let acquired!: () => void;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      const renewal = db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Subscription WHERE id = ${sub.id} FOR UPDATE`;
        acquired();
        await resume;
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: "active",
            currentPeriodEnd: new Date(Date.now() + 86400000),
            stateVersion: { increment: 1 },
          },
        });
      });
      await ready;
      const expiry = reconcileExpiredSubscriptions();
      await new Promise((resolve) => setTimeout(resolve, 30));
      release();
      await renewal;
      expect(await expiry).toBe(0);
      expect((await db.businessProfile.findUnique({ where: { id: workspaceId } }))?.plan).toBe(
        "PRO",
      );
    });
    it.each(["captured", "partially_refunded", "refunded"])(
      "preserves %s against a late Dodo payment failure",
      async (status) => {
        await db.payment.create({
          data: {
            userId,
            businessProfileId: workspaceId,
            provider: "dodo",
            billingMode: "test",
            providerPaymentId: "pay_fixture",
            amount: 12.345,
            currency: "KWD",
            status,
          },
        });
        provider.event = { type: "payment.failed", data: { payment_id: "pay_fixture" } };
        const response = await app.request("/billing/webhooks/dodo?mode=test", {
          method: "POST",
          headers: { "webhook-id": `${suffix}-failure` },
          body: "signed-fixture",
        });
        expect(response.status).toBe(200);
        expect((await db.payment.findFirst({ where: { userId } }))?.status).toBe(status);
      },
    );
    it("records Razorpay amount and currency metadata without INR substitution", async () => {
      await seedSubscription("active", "razorpay");
      provider.retrieve.mockResolvedValue(state("active"));
      const body = JSON.stringify({
        event: "subscription.charged",
        payload: {
          subscription: {
            entity: { id: "sub_fixture", notes: { userId, businessProfileId: workspaceId } },
          },
          payment: {
            entity: {
              id: "pay_fixture",
              order_id: "order_fixture",
              amount: 12345,
              currency: "KWD",
              status: "captured",
            },
          },
        },
      });
      const response = await app.request("/razorpay/webhook?mode=test", {
        method: "POST",
        headers: {
          "x-razorpay-event-id": `${suffix}-currency`,
          "x-razorpay-signature": createHmac("sha256", "fixture-secret").update(body).digest("hex"),
        },
        body,
      });
      expect(response.status).toBe(200);
      const payment = await db.payment.findFirst({ where: { userId } });
      expect(payment?.currency).toBe("KWD");
      expect(Number(payment?.amount)).toBe(12.345);
    });
    it.each([false, true])(
      "fences cancellation against a concurrent webhook, response lost=%s",
      async (lost) => {
        const sub = await seedSubscription();
        provider.cancel.mockImplementationOnce(async () => {
          await db.subscription.update({
            where: { id: sub.id },
            data: { status: "canceled", cancelAtPeriodEnd: true, stateVersion: { increment: 1 } },
          });
          if (lost) throw new Error("Response lost");
          return { status: "active", cancelAtPeriodEnd: true };
        });
        const response = await app.request("/billing/cancel", { method: "POST" });
        expect(response.status).toBe(lost ? 502 : 200);
        expect(await db.subscription.findUnique({ where: { id: sub.id } })).toMatchObject({
          status: "canceled",
          cancelAtPeriodEnd: true,
        });
      },
    );
    it("does not repeat an ambiguously accepted cancellation", async () => {
      const sub = await seedSubscription();
      provider.cancel.mockRejectedValueOnce(new Error("Response lost"));
      expect((await app.request("/billing/cancel", { method: "POST" })).status).toBe(502);
      expect((await app.request("/billing/cancel", { method: "POST" })).status).toBe(409);
      expect(provider.cancel).toHaveBeenCalledTimes(1);
      expect((await db.subscription.findUnique({ where: { id: sub.id } }))?.status).toBe(
        "cancellation_pending",
      );
    });
    it("lets one worker claim a durable operation and prevents terminal operation replay", async () => {
      const operation = await db.bulkActorStatusOperation.create({
        data: { userId, businessProfileId: workspaceId, action: "DEPRECATE", actorCount: 1 },
      });
      const claims = await Promise.all([
        claimActorStatusOperation(operation, "new-job"),
        claimActorStatusOperation(operation, "legacy-job"),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      await db.bulkActorStatusOperation.update({
        where: { id: operation.id },
        data: { status: "FAILED" },
      });
      expect(await claimActorStatusOperation(operation, "new-job")).toBe(false);
    });
    it.skipIf(
      !/^redis:\/\/(localhost|127\.0\.0\.1):\d+$/.test(
        process.env.ACTORCONSOLE_BILLING_TEST_REDIS_URL ?? "",
      ),
    )("redrives unknown dispatch with one deterministic Redis job", async () => {
      const redis = new URL(process.env.ACTORCONSOLE_BILLING_TEST_REDIS_URL!);
      const queue = new Queue("schedules", {
        connection: { host: redis.hostname, port: Number(redis.port), maxRetriesPerRequest: null },
        prefix: `billing-audit-${suffix}`,
      });
      try {
        const operation = await db.bulkActorStatusOperation.create({
          data: { userId, businessProfileId: workspaceId, action: "DEPRECATE", actorCount: 1 },
        });
        expect(await dispatchPendingActorStatusOperations(queue)).toBe(1);
        expect(await dispatchPendingActorStatusOperations(queue)).toBe(1);
        expect(await queue.getWaitingCount()).toBe(1);
        const job = await queue.getJob(bulkActorStatusJobId(operation.id));
        expect(job?.data).toEqual({
          bulkActorStatus: { operationId: operation.id, userId, businessProfileId: workspaceId },
        });
        await db.bulkActorStatusOperation.update({
          where: { id: operation.id },
          data: { status: "COMPLETED" },
        });
        expect(await dispatchPendingActorStatusOperations(queue)).toBe(0);
      } finally {
        await queue.close();
      }
    });
  },
);
