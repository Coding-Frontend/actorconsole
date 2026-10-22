import { getRazorpayClient, configuredCheckoutProduct } from "../lib/billing-providers.js";
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
import { db, Prisma } from "@actorconsole/db";
import { recordIntegrationTest } from "../lib/integrations.js";
import { trackEvent } from "../lib/analytics";
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
      if (
        existing &&
        !existing.razorpaySubscriptionId &&
        ["created", "authenticated", "active", "pending"].includes(existing.status)
      ) {
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
        ["created", "authenticated", "active", "pending"].includes(existing.status)
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
      if (
        existing?.razorpaySubscriptionId &&
        ["created", "authenticated", "active", "pending"].includes(existing.status)
      ) {
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

      const sub = await rz.subscriptions.create({
        plan_id: planId,
        customer_notify: 1,
        quantity: 1,
        total_count: 12,
        notes: {
          userId: session.userId,
          businessProfileId: session.businessProfileId,
          plan: body.plan,
          billingInterval: body.interval,
          billingMode: context.mode,
        },
      });

      await db.subscription.upsert({
        where: { businessProfileId: session.businessProfileId },
        create: {
          userId: session.userId,
          businessProfileId: session.businessProfileId,
          provider: "razorpay",
          billingMode: context.mode,
          providerSubscriptionId: sub.id,
          providerProductId: planId,
          providerCheckoutId: sub.id,
          razorpaySubscriptionId: sub.id,
          razorpayPlanId: planId,
          status: sub.status,
          shortUrl: sub.short_url ?? null,
        },
        update: {
          provider: "razorpay",
          billingMode: context.mode,
          providerSubscriptionId: sub.id,
          providerProductId: planId,
          providerCheckoutId: sub.id,
          razorpaySubscriptionId: sub.id,
          razorpayPlanId: planId,
          status: sub.status,
          shortUrl: sub.short_url ?? null,
        },
      });

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
    if (sub.status === "cancellation_pending") {
      return c.json(
        {
          ok: false,
          error: { code: "cancellation_pending", message: "Cancellation is already in progress." },
        },
        409,
      );
    }
    const claimed = await db.subscription.updateMany({
      where: { id: sub.id, status: sub.status },
      data: { status: "cancellation_pending" },
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
      await db.subscription.update({ where: { id: sub.id }, data: { status: sub.status } });
      throw error;
    }
    if (!rz) {
      await db.subscription.update({ where: { id: sub.id }, data: { status: sub.status } });
      return c.json({ ok: false, error: { code: "razorpay_not_configured" } }, 503);
    }

    let cancelled;
    try {
      cancelled = await rz.subscriptions.cancel(sub.razorpaySubscriptionId, true);
    } catch (error) {
      await db.subscription.update({ where: { id: sub.id }, data: { status: sub.status } });
      throw error;
    }
    await db.subscription.update({
      where: { id: sub.id },
      data: { status: cancelled.status, cancelAtPeriodEnd: true },
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

    if (eventId) {
      const existing = await db.webhookDelivery.findUnique({
        where: { source_externalId: { source, externalId: eventId } },
      });
      if (existing) return c.json({ ok: true, duplicate: true });
    }

    let delivery: { id: string };
    try {
      delivery = await db.webhookDelivery.create({
        data: {
          source,
          eventType,
          externalId: eventId,
          payload: summarizeRazorpayPayload(parsedPayload) as Prisma.InputJsonValue,
          status: valid ? "received" : "failed",
          signatureOk: valid,
          error: valid ? null : "invalid_signature",
        },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return c.json({ ok: true, duplicate: true });
      }
      throw error;
    }

    if (!valid) return c.json({ ok: false, error: { code: "invalid_signature" } }, 400);

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
          entity: { id: string; order_id: string; amount: number; method?: string; status: string };
        };
      };
    };

    switch (event.event) {
      case "subscription.activated":
      case "subscription.authenticated":
      case "subscription.created": {
        const s = event.payload.subscription?.entity;
        if (!s) break;
        const userId = s.notes?.userId;
        if (!userId) break;
        const businessProfile = await resolveWebhookBusinessProfile(
          userId,
          s.notes?.businessProfileId,
        );
        if (!businessProfile) break;
        const current = await db.subscription.findUnique({
          where: { businessProfileId: businessProfile.id },
        });
        if (!current && (await getGatewayContext("razorpay")).mode !== context.mode) break;
        if (
          !(await subscriptionMatchesMode(current, context)) ||
          (s.notes?.billingMode && s.notes.billingMode !== context.mode) ||
          (current &&
            (current.provider !== "razorpay" ||
              (current.razorpaySubscriptionId && current.razorpaySubscriptionId !== s.id)))
        )
          break;
        const plan = "PRO";
        await db.$transaction([
          db.subscription.upsert({
            where: { businessProfileId: businessProfile.id },
            create: {
              userId,
              businessProfileId: businessProfile.id,
              provider: "razorpay",
              billingMode: context.mode,
              providerSubscriptionId: s.id,
              razorpaySubscriptionId: s.id,
              status: s.status,
              currentPeriodEnd: s.current_period_end ? new Date(s.current_period_end * 1000) : null,
            },
            update: {
              provider: "razorpay",
              billingMode: context.mode,
              providerSubscriptionId: s.id,
              razorpaySubscriptionId: s.id,
              status: s.status,
              currentPeriodEnd: s.current_period_end ? new Date(s.current_period_end * 1000) : null,
            },
          }),
          db.businessProfile.update({ where: { id: businessProfile.id }, data: { plan } }),
        ]);
        break;
      }
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
        const existingPayment = await db.payment.findUnique({ where: { razorpayPaymentId: p.id } });
        if (existingPayment && !(await subscriptionMatchesMode(existingPayment, context))) break;
        await db.$transaction([
          db.payment.upsert({
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
              amount: (p.amount / 100) as unknown as any,
              currency: "INR",
              status: p.status,
              method: p.method,
              capturedAt: new Date(),
            },
            update: { status: p.status, capturedAt: new Date() },
          }),
          db.subscription.updateMany({
            where: { razorpaySubscriptionId: s.id },
            data: {
              status: s.status,
              currentPeriodEnd: s.current_period_end ? new Date(s.current_period_end * 1000) : null,
            },
          }),
        ]);
        break;
      }
      case "subscription.cancelled":
      case "subscription.halted":
      case "subscription.completed": {
        const s = event.payload.subscription?.entity;
        if (!s) break;
        const existing = await db.subscription.findUnique({
          where: { razorpaySubscriptionId: s.id },
        });
        if (existing && (await subscriptionMatchesMode(existing, context))) {
          if (event.event === "subscription.cancelled" || event.event === "subscription.halted") {
            const periodEnd = s.current_period_end
              ? new Date(s.current_period_end * 1000)
              : existing.currentPeriodEnd;
            const accessEnded =
              event.event === "subscription.halted" || !periodEnd || periodEnd <= new Date();
            if (existing.businessProfileId && accessEnded) {
              await db.$transaction([
                db.subscription.update({
                  where: { id: existing.id },
                  data: { status: s.status, cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd },
                }),
                db.businessProfile.update({
                  where: { id: existing.businessProfileId },
                  data: { plan: "FREE" },
                }),
              ]);
            } else {
              await db.subscription.update({
                where: { id: existing.id },
                data: { status: s.status, cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd },
              });
            }
          } else {
            await db.subscription.update({
              where: { id: existing.id },
              data: { status: s.status, cancelAtPeriodEnd: true },
            });
          }
        }
        break;
      }
      case "payment.failed": {
        const p = event.payload.payment?.entity;
        if (!p) break;
        await db.payment.updateMany({
          where: { razorpayOrderId: p.order_id, billingMode: context.mode },
          data: { status: "failed", notes: { paymentId: p.id } as any },
        });
        break;
      }
    }

    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "processed", responseMs: Date.now() - startedAt },
    });
    return c.json({ ok: true });
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

async function resolveWebhookBusinessProfile(userId: string, requestedId?: string) {
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
