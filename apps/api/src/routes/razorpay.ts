import {
  getRazorpayClient,
  configuredCheckoutProduct,
  createProviderCheckout,
} from "../lib/billing-providers.js";
import {
  getGatewayContext,
  getPaymentSetting,
  paymentWebhookContext,
  subscriptionMatchesMode,
  legacyGatewayMode,
} from "../lib/payment-gateway-settings.js";
import { Hono } from "hono";
import { z } from "zod";
import { verifyRazorpaySignature } from "@actorconsole/shared";
import { db } from "@actorconsole/db";
import { subscriptionBlocksCheckout } from "@actorconsole/shared";
import {
  reserveBillingCheckout,
  completeBillingCheckout,
  failBillingCheckout,
} from "../lib/billing-checkout-operations.js";
import {
  claimPaymentWebhook,
  completePaymentWebhook,
  failPaymentWebhook,
} from "../lib/payment-webhook-delivery.js";
import { recordIntegrationTest } from "../lib/integrations.js";
import { trackEvent } from "../lib/analytics";
import { reconcileBillingSubscription } from "../lib/billing-state.js";
import { recordPaymentCapture } from "../lib/billing-payment-state.js";
import { providerAmount } from "../lib/billing-amount.js";
import { isDefinitiveProviderRejection } from "../lib/billing-provider-errors.js";
import type { AppEnv } from "../app.js";

/**
 * Razorpay payment routes.
 *
 * Plan:
 *   - Admin configures razorpay_key_id, razorpay_key_secret, plan IDs in the
 *     Payment gateways admin page (or env fallback).
 *   - User clicks "Upgrade to Pro" → POST /razorpay/create-subscription
 *   - Server creates a Razorpay Subscription for the user.
 *   - Client uses the returned short_url (or order) to complete payment.
 *   - Razorpay fires webhooks → /razorpay/webhook → DB state updated.
 *   - For one-off payments (lifetime deals, etc.) we use orders + verify.
 */

export const razorpayRoutes = new Hono<AppEnv>()
  /**
   * Create a Razorpay Subscription for the authenticated user.
   * Returns the subscription + shortUrl the client should redirect to.
   */
  .post(
    "/create-subscription",
    zValidator(
      "json",
      z.object({
        plan: z.literal("PRO"),
        interval: z.enum(["month", "year"]),
      }),
    ),
    async (c) => {
      const session = c.get("session");
      const body = c.req.valid("json");
      if (!session.businessProfileId) {
        return c.json(
          {
            ok: false,
            error: { code: "workspace_required", message: "Select a workspace first." },
          },
          409,
        );
      }
      // Check gateway toggle
      const gateway = await db.paymentGateway.findUnique({ where: { key: "razorpay" } });
      if (!gateway || !gateway.enabled) {
        return c.json(
          {
            ok: false,
            error: { code: "gateway_disabled", message: "Razorpay is disabled. Contact support." },
          },
          503,
        );
      }

      const context = await getGatewayContext("razorpay");
      const rz = await getRazorpayClient(context);
      if (!rz) {
        return c.json(
          {
            ok: false,
            error: {
              code: "razorpay_not_configured",
              message: "Razorpay credentials not set in admin → Payment gateways.",
            },
          },
          503,
        );
      }
      const planId = await configuredCheckoutProduct("razorpay", body.interval, context);
      if (!planId) {
        return c.json(
          {
            ok: false,
            error: {
              code: "razorpay_plan_not_configured",
              message: `Plan ID for ${body.plan} not configured.`,
            },
          },
          503,
        );
      }

      const existing = await db.subscription.findUnique({
        where: { businessProfileId: session.businessProfileId },
      });
      if (existing && !existing.razorpaySubscriptionId && subscriptionBlocksCheckout(existing)) {
        return c.json(
          {
            ok: false,
            error: {
              code: "admin_managed_subscription",
              message: "This workspace has an admin-managed plan. Contact support to change it.",
            },
          },
          409,
        );
      }
      if (
        existing?.razorpaySubscriptionId &&
        existing.razorpayPlanId === planId &&
        (await subscriptionMatchesMode(existing, context)) &&
        subscriptionBlocksCheckout(existing)
      ) {
        return c.json({
          ok: true,
          data: {
            subscriptionId: existing.razorpaySubscriptionId,
            shortUrl: existing.shortUrl,
            status: existing.status,
            plan: body.plan,
          },
        });
      }
      if (existing?.razorpaySubscriptionId && subscriptionBlocksCheckout(existing)) {
        return c.json(
          {
            ok: false,
            error: {
              code: "subscription_change_required",
              message: "Cancel the current subscription before changing plans.",
            },
          },
          409,
        );
      }

      const operationId = await reserveBillingCheckout({
        businessProfileId: session.businessProfileId,
        userId: session.userId,
        context,
        productId: planId,
        interval: body.interval,
      });
      let checkout;
      try {
        checkout = await createProviderCheckout(
          "razorpay",
          body.plan,
          {
            userId: session.userId,
            businessProfileId: session.businessProfileId,
            email: session.email,
            operationId,
          },
          body.interval,
          context,
        );
      } catch (error) {
        await failBillingCheckout(operationId, error);
        throw error;
      }
      await completeBillingCheckout(operationId, checkout);
      const sub = {
        id: checkout.providerSubscriptionId,
        status: checkout.status,
        short_url: checkout.checkoutUrl,
      };

      trackEvent("subscription.created", {
        userId: session.userId,
        properties: { plan: body.plan, subscriptionId: sub.id },
      });

      return c.json({
        ok: true,
        data: {
          subscriptionId: sub.id,
          shortUrl: sub.short_url,
          status: sub.status,
          plan: body.plan,
        },
      });
    },
  )

  /**
   * Cancel the current user's subscription.
   */
  .post("/cancel-subscription", async (c) => {
    const session = c.get("session");
    if (!session.businessProfileId) {
      return c.json(
        { ok: false, error: { code: "workspace_required", message: "Select a workspace first." } },
        409,
      );
    }
    const sub = await db.subscription.findUnique({
      where: { businessProfileId: session.businessProfileId },
    });
    if (!sub || !sub.razorpaySubscriptionId) {
      return c.json({ ok: false, error: { code: "no_active_subscription" } }, 404);
    }
    if (sub.cancelAtPeriodEnd || sub.status === "cancellation_pending") {
      return c.json(
        {
          ok: false,
          error: { code: "cancellation_pending", message: "Cancellation is already in progress." },
        },
        409,
      );
    }
    const claimed = await db.subscription.updateMany({
      where: {
        id: sub.id,
        status: sub.status,
        cancelAtPeriodEnd: false,
        stateVersion: sub.stateVersion ?? 0,
        providerSubscriptionId: sub.providerSubscriptionId,
        updatedAt: sub.updatedAt,
      },
      data: { status: "cancellation_pending", stateVersion: { increment: 1 } },
    });
    if (!claimed.count) {
      return c.json(
        {
          ok: false,
          error: {
            code: "subscription_changed",
            message: "Subscription state changed. Refresh and try again.",
          },
        },
        409,
      );
    }
    let rz;
    try {
      rz = await getRazorpayClient(
        sub.billingMode === "test" || sub.billingMode === "live"
          ? sub.billingMode
          : await legacyGatewayMode("razorpay"),
      );
    } catch (error) {
      await db.subscription.updateMany({
        where: {
          id: sub.id,
          status: "cancellation_pending",
          cancelAtPeriodEnd: false,
          stateVersion: (sub.stateVersion ?? 0) + 1,
        },
        data: { status: sub.status, stateVersion: { increment: 1 } },
      });
      throw error;
    }
    if (!rz) {
      await db.subscription.updateMany({
        where: {
          id: sub.id,
          status: "cancellation_pending",
          cancelAtPeriodEnd: false,
          stateVersion: (sub.stateVersion ?? 0) + 1,
        },
        data: { status: sub.status, stateVersion: { increment: 1 } },
      });
      return c.json({ ok: false, error: { code: "razorpay_not_configured" } }, 503);
    }

    let cancelled;
    try {
      cancelled = await rz.subscriptions.cancel(sub.razorpaySubscriptionId, true);
    } catch (error) {
      if (isDefinitiveProviderRejection(error))
        await db.subscription.updateMany({
          where: {
            id: sub.id,
            status: "cancellation_pending",
            cancelAtPeriodEnd: false,
            stateVersion: (sub.stateVersion ?? 0) + 1,
          },
          data: { status: sub.status, stateVersion: { increment: 1 } },
        });
      throw error;
    }
    await db.subscription.updateMany({
      where: {
        id: sub.id,
        status: "cancellation_pending",
        cancelAtPeriodEnd: false,
        stateVersion: (sub.stateVersion ?? 0) + 1,
      },
      data: { status: cancelled.status, cancelAtPeriodEnd: true, stateVersion: { increment: 1 } },
    });
    return c.json({ ok: true, data: { status: cancelled.status } });
  })

  /**
   * Public — Razorpay webhook receiver.
   * Configure the URL in Razorpay Dashboard → Webhooks.
   */
  .post("/webhook", async (c) => {
    const startedAt = Date.now();
    const raw = await c.req.text();
    const sig = c.req.header("x-razorpay-signature");
    const eventId = c.req.header("x-razorpay-event-id");
    if (c.req.query("mode") && !["test", "live"].includes(c.req.query("mode")!))
      return c.json({ ok: false, error: { code: "invalid_mode" } }, 400);
    const context = await paymentWebhookContext("razorpay", c.req.query("mode"));
    const source = `razorpay:${context.mode}`;
    const webhookSecret = await getPaymentSetting("razorpay_webhook_secret", context);
    if (!webhookSecret) {
      return c.json({ ok: false, error: { code: "razorpay_webhook_secret_missing" } }, 503);
    }
    const valid = verifyRazorpaySignature(raw, sig, webhookSecret);
    if (!valid) return c.json({ ok: false, error: { code: "invalid_signature" } }, 400);
    const parsedPayload = safeJson(raw);
    const eventType =
      typeof parsedPayload === "object" && parsedPayload && typeof parsedPayload.event === "string"
        ? parsedPayload.event
        : "unknown";

    const claim = await claimPaymentWebhook({
      source,
      externalId: eventId ?? null,
      eventType,
      payload: summarizeRazorpayPayload(parsedPayload),
    });
    if (claim.state === "duplicate") return c.json({ ok: true, duplicate: true });
    if (claim.state !== "claimed")
      return c.json({ ok: false, error: { code: "webhook_in_progress" } }, 503);

    try {
      const event = parsedPayload as {
        event: string;
        payload: {
          subscription?: {
            entity: {
              id: string;
              status: string;
              current_period_end?: number;
              notes?: Record<string, string>;
            };
          };
          payment?: {
            entity: {
              id: string;
              order_id: string;
              amount: number;
              currency: string;
              method?: string;
              status: string;
            };
          };
        };
      };

      const providerSubscription = event.payload?.subscription?.entity;
      if (
        providerSubscription &&
        [
          "subscription.activated",
          "subscription.authenticated",
          "subscription.created",
          "subscription.charged",
          "subscription.cancelled",
          "subscription.halted",
          "subscription.completed",
        ].includes(event.event)
      ) {
        const existing = await db.subscription.findUnique({
          where: { razorpaySubscriptionId: providerSubscription.id },
        });
        const businessProfile = existing?.businessProfileId
          ? { id: existing.businessProfileId }
          : await resolveWebhookBusinessProfile(
              providerSubscription.notes?.userId,
              providerSubscription.notes?.businessProfileId,
            );
        if (businessProfile)
          await reconcileBillingSubscription({
            context,
            id: providerSubscription.id,
            businessProfileId: businessProfile.id,
            userId: existing?.userId ?? providerSubscription.notes?.userId,
          });
      }
      switch (event.event) {
        case "subscription.charged": {
          const s = event.payload.subscription?.entity;
          const p = event.payload.payment?.entity;
          if (!s || !p) break;
          const existingSubscription = await db.subscription.findUnique({
            where: { razorpaySubscriptionId: s.id },
          });
          if (
            !(await subscriptionMatchesMode(existingSubscription, context)) ||
            (s.notes?.billingMode && s.notes.billingMode !== context.mode)
          )
            break;
          const userId = existingSubscription?.userId ?? s.notes?.userId;
          if (!userId) break;
          const businessProfile = await resolveWebhookBusinessProfile(
            userId,
            existingSubscription?.businessProfileId ?? s.notes?.businessProfileId,
          );
          if (!businessProfile) break;
          const existingPayment = await db.payment.findUnique({
            where: { razorpayPaymentId: p.id },
          });
          if (existingPayment && !(await subscriptionMatchesMode(existingPayment, context))) break;
          await recordPaymentCapture({
            where: { razorpayPaymentId: p.id },
            create: {
              userId,
              businessProfileId: businessProfile.id,
              subscriptionId: existingSubscription?.id,
              provider: "razorpay",
              billingMode: context.mode,
              providerPaymentId: p.id,
              providerOrderId: p.order_id,
              razorpayPaymentId: p.id,
              razorpayOrderId: p.order_id,
              ...providerAmount(p.amount, p.currency),
              status: p.status,
              method: p.method,
              capturedAt: new Date(),
            },
            update: { status: p.status, capturedAt: new Date() },
          });
          break;
        }
        case "payment.failed": {
          const p = event.payload.payment?.entity;
          if (!p) break;
          await db.payment.updateMany({
            where: {
              razorpayOrderId: p.order_id,
              billingMode: context.mode,
              status: { notIn: ["captured", "refunded", "partially_refunded"] },
            },
            data: { status: "failed", notes: { paymentId: p.id } as any },
          });
          break;
        }
      }

      await completePaymentWebhook(claim.lease, Date.now() - startedAt);
      return c.json({ ok: true });
    } catch (error) {
      await failPaymentWebhook(claim.lease, error);
      throw error;
    }
  })

  /**
   * Admin-only — test that Razorpay credentials work.
   * Hits Razorpay's `payments` endpoint with limit=1 as a sanity check.
   */
  .post("/test", async (c) => {
    const rz = await getRazorpayClient();
    if (!rz) {
      await recordIntegrationTest("razorpay_key_id", "error", "Credentials missing");
      return c.json({ ok: false, error: { code: "razorpay_not_configured" } }, 503);
    }
    try {
      const list = await rz.payments.all({ count: 1 });
      await recordIntegrationTest(
        "razorpay_key_id",
        "ok",
        `Reachable. ${list.items.length} payment(s) in last fetch.`,
      );
      return c.json({ ok: true, data: { count: list.items.length } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordIntegrationTest("razorpay_key_id", "error", message);
      return c.json({ ok: false, error: { code: "test_failed", message } }, 400);
    }
  });

function safeJson(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function resolveWebhookBusinessProfile(userId: string | undefined, requestedId?: string) {
  if (!userId) return null;
  if (requestedId) {
    const requested = await db.businessProfile.findFirst({
      where: { id: requestedId, userId },
      select: { id: true },
    });
    if (requested) return requested;
  }
  return db.businessProfile.findFirst({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
}

function summarizeRazorpayPayload(payload: any): Record<string, unknown> {
  const subscription = payload?.payload?.subscription?.entity;
  const payment = payload?.payload?.payment?.entity;
  return {
    event: typeof payload?.event === "string" ? payload.event : "unknown",
    subscriptionId: typeof subscription?.id === "string" ? subscription.id : undefined,
    paymentId: typeof payment?.id === "string" ? payment.id : undefined,
    orderId: typeof payment?.order_id === "string" ? payment.order_id : undefined,
  };
}

// zValidator import (placed here to keep top of file clean)
import { zValidator } from "@hono/zod-validator";
