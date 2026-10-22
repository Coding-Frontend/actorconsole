import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import Stripe from "stripe";
import { db, Prisma } from "@actorconsole/db";
import {
  cancelProviderSubscription,
  createProviderCheckout,
  configuredCheckoutProduct,
  getDodoClient,
  getStripeClient,
  gatewayReadiness,
} from "../lib/billing-providers.js";
import {
  getGatewayContext,
  getPaymentSetting,
  paymentWebhookContext,
  subscriptionMatchesMode,
  type GatewayContext,
} from "../lib/payment-gateway-settings.js";
import { trackEvent } from "../lib/analytics.js";
import { isDodoLivePaymentsUnavailable } from "../lib/billing-provider-errors.js";
import type { AppEnv } from "../app.js";

const checkoutBody = z
  .object({
    gateway: z.enum(["stripe", "razorpay", "dodo"]),
    plan: z.literal("PRO"),
    interval: z.enum(["month", "year"]),
  })
  .strict();

const ACTIVE_STATUSES = new Set([
  "open",
  "created",
  "authenticated",
  "active",
  "trialing",
  "pending",
  "on_hold",
  "cancellation_pending",
]);

export const billingRoutes = new Hono<AppEnv>()
  .post("/checkout", zValidator("json", checkoutBody), async (c) => {
    const session = c.get("session");
    const { gateway, plan, interval } = c.req.valid("json");
    if (!session.businessProfileId) {
      return c.json(
        { ok: false, error: { code: "workspace_required", message: "Select a workspace first." } },
        409,
      );
    }
    const gatewayRow = await db.paymentGateway.findUnique({ where: { key: gateway } });
    if (!gatewayRow?.enabled) {
      return c.json(
        {
          ok: false,
          error: {
            code: "gateway_disabled",
            message: `${gatewayRow?.name ?? gateway} is disabled.`,
          },
        },
        503,
      );
    }
    const context = await getGatewayContext(gateway);
    const readiness = await gatewayReadiness(gateway, context);
    if (!readiness.ready) {
      return c.json(
        {
          ok: false,
          error: {
            code: "gateway_not_configured",
            message: `${gatewayRow.name} is missing required credentials or subscription product IDs.`,
          },
        },
        503,
      );
    }

    const selectedProductId = await configuredCheckoutProduct(gateway, interval, context);
    if (!selectedProductId) {
      return c.json(
        {
          ok: false,
          error: {
            code: "billing_interval_unavailable",
            message: `The ${interval === "year" ? "yearly" : "monthly"} Pro option is not configured for ${gatewayRow.name}. Choose an available billing option.`,
          },
        },
        409,
      );
    }

    const [existing, user] = await Promise.all([
      db.subscription.findUnique({ where: { businessProfileId: session.businessProfileId } }),
      db.user.findUnique({
        where: { id: session.userId },
        select: { email: true, name: true },
      }),
    ]);
    if (!user) return c.json({ ok: false, error: { code: "user_not_found" } }, 404);

    if (existing && existing.provider === "manual" && ACTIVE_STATUSES.has(existing.status)) {
      return c.json(
        {
          ok: false,
          error: {
            code: "admin_managed_subscription",
            message: "This workspace has an administrator-managed plan.",
          },
        },
        409,
      );
    }
    if (existing && ACTIVE_STATUSES.has(existing.status)) {
      if (
        existing.provider === gateway &&
        (await subscriptionMatchesMode(existing, context)) &&
        existing.shortUrl &&
        !existing.providerSubscriptionId &&
        existing.providerProductId === selectedProductId
      ) {
        return c.json({
          ok: true,
          data: {
            gateway,
            checkoutUrl: existing.shortUrl,
            checkoutId: existing.providerCheckoutId,
            status: existing.status,
          },
        });
      }
      return c.json(
        {
          ok: false,
          error: {
            code: "subscription_change_required",
            message: `Cancel the current ${existing.provider} subscription before starting another one.`,
          },
        },
        409,
      );
    }

    let checkout;
    try {
      const actor = {
        userId: session.userId,
        businessProfileId: session.businessProfileId,
        email: user.email,
        name: user.name,
      };
      checkout = await createProviderCheckout(gateway, plan, actor, interval, context);
    } catch (error) {
      if (gateway === "dodo" && context.mode === "live" && isDodoLivePaymentsUnavailable(error)) {
        return c.json(
          {
            ok: false,
            error: {
              code: "merchant_live_payments_unavailable",
              message:
                "Live checkout is temporarily unavailable because Dodo Payments has not activated payments for this merchant. Please contact billing support.",
            },
          },
          503,
        );
      }
      return c.json(
        {
          ok: false,
          error: {
            code: "provider_error",
            message:
              error instanceof Error ? error.message : "The payment provider rejected checkout.",
          },
        },
        502,
      );
    }

    await db.subscription.upsert({
      where: { businessProfileId: session.businessProfileId },
      create: {
        userId: session.userId,
        businessProfileId: session.businessProfileId,
        provider: gateway,
        billingMode: context.mode,
        source: "gateway",
        providerSubscriptionId: checkout.providerSubscriptionId,
        providerProductId: checkout.providerProductId,
        providerCheckoutId: checkout.checkoutId,
        razorpaySubscriptionId:
          gateway === "razorpay" ? checkout.providerSubscriptionId : undefined,
        razorpayPlanId: gateway === "razorpay" ? checkout.providerProductId : undefined,
        status: checkout.status,
        shortUrl: checkout.checkoutUrl,
      },
      update: {
        userId: session.userId,
        provider: gateway,
        billingMode: context.mode,
        source: "gateway",
        providerCustomerId: null,
        providerSubscriptionId: checkout.providerSubscriptionId,
        providerProductId: checkout.providerProductId,
        providerCheckoutId: checkout.checkoutId,
        razorpayCustomerId: null,
        razorpaySubscriptionId: gateway === "razorpay" ? checkout.providerSubscriptionId : null,
        razorpayPlanId: gateway === "razorpay" ? checkout.providerProductId : null,
        status: checkout.status,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        shortUrl: checkout.checkoutUrl,
      },
    });
    trackEvent("subscription.checkout_created", {
      userId: session.userId,
      properties: { gateway, plan, interval, checkoutId: checkout.checkoutId },
    });
    return c.json({ ok: true, data: checkout });
  })

  .post("/cancel", async (c) => {
    const session = c.get("session");
    if (!session.businessProfileId) {
      return c.json({ ok: false, error: { code: "workspace_required" } }, 409);
    }
    const subscription = await db.subscription.findUnique({
      where: { businessProfileId: session.businessProfileId },
    });
    if (!subscription || subscription.provider === "manual") {
      return c.json({ ok: false, error: { code: "no_gateway_subscription" } }, 404);
    }
    if (subscription.cancelAtPeriodEnd || subscription.status === "cancellation_pending") {
      return c.json(
        {
          ok: false,
          error: { code: "cancellation_pending", message: "Cancellation is already scheduled." },
        },
        409,
      );
    }

    const claimed = await db.subscription.updateMany({
      where: { id: subscription.id, status: subscription.status },
      data: { status: "cancellation_pending" },
    });
    if (!claimed.count) {
      return c.json({ ok: false, error: { code: "subscription_changed" } }, 409);
    }
    try {
      const result = await cancelProviderSubscription(subscription);
      const updated = await db.subscription.update({
        where: { id: subscription.id },
        data: { status: result.status, cancelAtPeriodEnd: result.cancelAtPeriodEnd },
      });
      return c.json({ ok: true, data: updated });
    } catch (error) {
      await db.subscription.update({
        where: { id: subscription.id },
        data: { status: subscription.status },
      });
      return c.json(
        {
          ok: false,
          error: {
            code: "provider_error",
            message: error instanceof Error ? error.message : "Cancellation failed.",
          },
        },
        502,
      );
    }
  })

  .post("/webhooks/stripe", async (c) => {
    const raw = await c.req.text();
    const signature = c.req.header("stripe-signature");
    if (c.req.query("mode") && !["test", "live"].includes(c.req.query("mode")!))
      return c.json({ ok: false, error: { code: "invalid_mode" } }, 400);
    const context = await paymentWebhookContext("stripe", c.req.query("mode"));
    const source = `stripe:${context.mode}`;
    const [stripe, webhookSecret] = await Promise.all([
      getStripeClient(context),
      getPaymentSetting("stripe_webhook_secret", context),
    ]);
    if (!stripe || !webhookSecret) {
      return c.json({ ok: false, error: { code: "stripe_webhook_not_configured" } }, 503);
    }
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(raw, signature ?? "", webhookSecret);
    } catch {
      return c.json({ ok: false, error: { code: "invalid_signature" } }, 400);
    }
    if (event.livemode !== undefined && event.livemode !== (context.mode === "live"))
      return c.json({ ok: false, error: { code: "mode_mismatch" } }, 400);
    if (await webhookSeen(source, event.id)) return c.json({ ok: true, duplicate: true });
    const deliveryId = await createWebhookDelivery(
      source,
      event.id,
      event.type,
      summarizeStripeEvent(event),
    );
    try {
      await processStripeEvent(event, context);
      await completeWebhookDelivery(deliveryId);
      return c.json({ ok: true });
    } catch (error) {
      await failWebhookDelivery(deliveryId, error);
      throw error;
    }
  })

  .post("/webhooks/dodo", async (c) => {
    const raw = await c.req.text();
    const headers = {
      "webhook-id": c.req.header("webhook-id") ?? "",
      "webhook-signature": c.req.header("webhook-signature") ?? "",
      "webhook-timestamp": c.req.header("webhook-timestamp") ?? "",
    };
    if (c.req.query("mode") && !["test", "live"].includes(c.req.query("mode")!))
      return c.json({ ok: false, error: { code: "invalid_mode" } }, 400);
    const context = await paymentWebhookContext("dodo", c.req.query("mode"));
    const source = `dodo:${context.mode}`;
    const dodo = await getDodoClient({ requireWebhookKey: true, mode: context });
    if (!dodo) {
      return c.json({ ok: false, error: { code: "dodo_webhook_not_configured" } }, 503);
    }
    let event: any;
    try {
      event = dodo.webhooks.unwrap(raw, { headers });
    } catch {
      return c.json({ ok: false, error: { code: "invalid_signature" } }, 400);
    }
    const eventId = headers["webhook-id"];
    const previous = await db.webhookDelivery.findUnique({
      where: { source_externalId: { source, externalId: eventId } },
      select: { id: true, status: true, attemptedAt: true },
    });
    if (previous?.status === "processed") return c.json({ ok: true, duplicate: true });
    const staleBefore = new Date(Date.now() - 5 * 60_000);
    if (previous?.status === "received" && previous.attemptedAt >= staleBefore) {
      return c.json({ ok: false, error: { code: "webhook_in_progress" } }, 503);
    }
    let deliveryId: string;
    if (previous?.status === "failed" || previous?.status === "received") {
      const claim = await db.webhookDelivery.updateMany({
        where: {
          id: previous.id,
          status: previous.status,
          ...(previous.status === "received" ? { attemptedAt: { lt: staleBefore } } : {}),
        },
        data: { status: "received", error: null, attemptedAt: new Date() },
      });
      if (!claim.count) {
        return c.json({ ok: false, error: { code: "webhook_in_progress" } }, 503);
      }
      deliveryId = previous.id;
    } else {
      try {
        deliveryId = await createWebhookDelivery(source, eventId, event.type, {
          type: event.type,
          subscriptionId: event.data?.subscription_id,
          paymentId: event.data?.payment_id,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return c.json({ ok: false, error: { code: "webhook_in_progress" } }, 503);
        }
        throw error;
      }
    }
    try {
      await processDodoEvent(event, context);
      await completeWebhookDelivery(deliveryId);
      return c.json({ ok: true });
    } catch (error) {
      await failWebhookDelivery(deliveryId, error);
      throw error;
    }
  });

async function webhookSeen(source: string, externalId: string) {
  return db.webhookDelivery.findUnique({
    where: { source_externalId: { source, externalId } },
    select: { id: true },
  });
}

async function createWebhookDelivery(
  source: string,
  externalId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  const row = await db.webhookDelivery.create({
    data: {
      source,
      externalId,
      eventType,
      payload: payload as Prisma.InputJsonValue,
      status: "received",
      signatureOk: true,
    },
    select: { id: true },
  });
  return row.id;
}

async function completeWebhookDelivery(id: string) {
  await db.webhookDelivery.update({ where: { id }, data: { status: "processed" } });
}

async function failWebhookDelivery(id: string, error: unknown) {
  await db.webhookDelivery.update({
    where: { id },
    data: {
      status: "failed",
      error: (error instanceof Error ? error.message : String(error)).slice(0, 1_000),
    },
  });
}

function summarizeStripeEvent(event: Stripe.Event) {
  const object = event.data.object as any;
  return {
    type: event.type,
    objectId: typeof object?.id === "string" ? object.id : undefined,
    subscriptionId: externalId(object?.subscription) ?? stripeInvoiceSubscriptionId(object),
  };
}

async function processStripeEvent(event: Stripe.Event, context: GatewayContext) {
  const object = event.data.object as any;
  if (event.type === "checkout.session.completed") {
    const metadata = object.metadata ?? {};
    const businessProfile = await resolveWebhookBusinessProfile(
      metadata.userId,
      metadata.businessProfileId ?? object.client_reference_id,
    );
    if (!businessProfile) return;
    if (
      !(await webhookMayUpdateWorkspace(
        businessProfile.id,
        context,
        externalId(object.subscription),
        object.id,
      ))
    )
      return;
    const subscriptionId = externalId(object.subscription);
    const customerId = externalId(object.customer);
    await db.$transaction([
      db.subscription.upsert({
        where: { businessProfileId: businessProfile.id },
        create: {
          userId: metadata.userId,
          businessProfileId: businessProfile.id,
          provider: "stripe",
          billingMode: context.mode,
          providerCustomerId: customerId,
          providerSubscriptionId: subscriptionId,
          providerCheckoutId: object.id,
          status: object.payment_status === "paid" ? "active" : (object.status ?? "complete"),
          shortUrl: object.url ?? null,
        },
        update: {
          provider: "stripe",
          billingMode: context.mode,
          providerCustomerId: customerId,
          providerSubscriptionId: subscriptionId,
          providerCheckoutId: object.id,
          status: object.payment_status === "paid" ? "active" : (object.status ?? "complete"),
        },
      }),
      db.businessProfile.update({ where: { id: businessProfile.id }, data: { plan: "PRO" } }),
    ]);
    return;
  }

  if (event.type.startsWith("customer.subscription.")) {
    const metadata = object.metadata ?? {};
    let existing = await db.subscription.findUnique({
      where: {
        provider_providerSubscriptionId: {
          provider: "stripe",
          providerSubscriptionId: object.id,
        },
      },
    });
    const businessProfile =
      (existing?.businessProfileId
        ? { id: existing.businessProfileId }
        : await resolveWebhookBusinessProfile(metadata.userId, metadata.businessProfileId)) ?? null;
    if (!businessProfile) return;
    if (
      !(await subscriptionMatchesMode(existing, context)) ||
      !(await webhookMayUpdateWorkspace(businessProfile.id, context, object.id))
    )
      return;
    const periodEnd = stripePeriodEnd(object);
    const status = object.status ?? "unknown";
    const ended = ["canceled", "unpaid", "incomplete_expired", "paused"].includes(status);
    const entitled =
      ["active", "trialing", "past_due"].includes(status) ||
      (ended && Boolean(periodEnd && periodEnd > new Date()));
    const update = db.subscription.upsert({
      where: { businessProfileId: businessProfile.id },
      create: {
        userId: metadata.userId,
        businessProfileId: businessProfile.id,
        provider: "stripe",
        billingMode: context.mode,
        providerCustomerId: externalId(object.customer),
        providerSubscriptionId: object.id,
        status,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
      },
      update: {
        provider: "stripe",
        billingMode: context.mode,
        providerCustomerId: externalId(object.customer),
        providerSubscriptionId: object.id,
        status,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
      },
    });
    await db.$transaction([
      update,
      db.businessProfile.update({
        where: { id: businessProfile.id },
        data: { plan: entitled ? "PRO" : "FREE" },
      }),
    ]);
    return;
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    const subscriptionId = stripeInvoiceSubscriptionId(object);
    if (!subscriptionId) return;
    const subscription = await db.subscription.findUnique({
      where: {
        provider_providerSubscriptionId: {
          provider: "stripe",
          providerSubscriptionId: subscriptionId,
        },
      },
    });
    if (!subscription || !(await subscriptionMatchesMode(subscription, context))) return;
    const providerPaymentId = externalId(object.payment_intent) ?? object.id;
    const existingPayment = await db.payment.findUnique({
      where: { provider_providerPaymentId: { provider: "stripe", providerPaymentId } },
      select: { billingMode: true },
    });
    if (existingPayment && !(await subscriptionMatchesMode(existingPayment, context))) return;
    await db.payment.upsert({
      where: {
        provider_providerPaymentId: { provider: "stripe", providerPaymentId },
      },
      create: {
        userId: subscription.userId,
        businessProfileId: subscription.businessProfileId,
        subscriptionId: subscription.id,
        provider: "stripe",
        billingMode: context.mode,
        providerPaymentId,
        providerInvoiceId: object.id,
        amount: minorToMajor(object.amount_paid ?? object.total ?? 0, object.currency),
        currency: String(object.currency ?? "usd").toUpperCase(),
        status: "captured",
        method: "stripe",
        capturedAt: new Date(),
      },
      update: { status: "captured", capturedAt: new Date() },
    });
    return;
  }

  if (event.type === "invoice.payment_failed") {
    const providerInvoiceId = object.id;
    await db.payment.updateMany({
      where: { provider: "stripe", providerInvoiceId, billingMode: context.mode },
      data: { status: "failed" },
    });
  }
}

async function processDodoEvent(event: any, context: GatewayContext) {
  const data = event.data ?? {};
  if (data.metadata?.billingMode && data.metadata.billingMode !== context.mode) return;
  if (event.type.startsWith("subscription.")) {
    const metadata = data.metadata ?? {};
    const existing = data.subscription_id
      ? await db.subscription.findUnique({
          where: {
            provider_providerSubscriptionId: {
              provider: "dodo",
              providerSubscriptionId: data.subscription_id,
            },
          },
        })
      : null;
    const businessProfile =
      (existing?.businessProfileId
        ? { id: existing.businessProfileId }
        : await resolveWebhookBusinessProfile(metadata.userId, metadata.businessProfileId)) ?? null;
    if (!businessProfile) return;
    const current = await db.subscription.findUnique({
      where: { businessProfileId: businessProfile.id },
      select: { provider: true, providerSubscriptionId: true, billingMode: true },
    });
    if (!current && (await getGatewayContext(context.gateway)).mode !== context.mode) return;
    if (
      current &&
      (!(await subscriptionMatchesMode(current, context)) ||
        current.provider !== "dodo" ||
        (current.providerSubscriptionId && current.providerSubscriptionId !== data.subscription_id))
    ) {
      return;
    }
    if (
      !(await subscriptionMatchesMode(existing, context)) ||
      (metadata.billingMode && metadata.billingMode !== context.mode)
    )
      return;
    const periodEnd = data.next_billing_date ? new Date(data.next_billing_date) : null;
    const ended = ["cancelled", "failed", "expired"].includes(data.status);
    const entitled =
      data.status === "active" ||
      (data.status === "on_hold" && Boolean(periodEnd && periodEnd > new Date())) ||
      (ended && Boolean(periodEnd && periodEnd > new Date()));
    await db.$transaction([
      db.subscription.upsert({
        where: { businessProfileId: businessProfile.id },
        create: {
          userId: metadata.userId,
          businessProfileId: businessProfile.id,
          provider: "dodo",
          billingMode: context.mode,
          providerCustomerId: data.customer?.customer_id,
          providerSubscriptionId: data.subscription_id,
          providerProductId: data.product_id,
          status: data.status,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: Boolean(data.cancel_at_next_billing_date),
        },
        update: {
          provider: "dodo",
          billingMode: context.mode,
          providerCustomerId: data.customer?.customer_id,
          providerSubscriptionId: data.subscription_id,
          providerProductId: data.product_id,
          status: data.status,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: Boolean(data.cancel_at_next_billing_date),
        },
      }),
      db.businessProfile.update({
        where: { id: businessProfile.id },
        data: { plan: entitled ? "PRO" : "FREE" },
      }),
    ]);
    return;
  }

  if (event.type === "payment.succeeded") {
    let subscription = data.subscription_id
      ? await db.subscription.findUnique({
          where: {
            provider_providerSubscriptionId: {
              provider: "dodo",
              providerSubscriptionId: data.subscription_id,
            },
          },
        })
      : null;
    if (!subscription && data.checkout_session_id) {
      subscription = await db.subscription.findFirst({
        where: { provider: "dodo", providerCheckoutId: data.checkout_session_id },
      });
    }
    if (!(await subscriptionMatchesMode(subscription, context))) return;
    if (
      subscription?.providerSubscriptionId &&
      data.subscription_id &&
      subscription.providerSubscriptionId !== data.subscription_id
    ) {
      return;
    }
    // Dodo explicitly does not guarantee webhook ordering. If the successful
    // payment arrives before subscription.active, reconstruct the local
    // subscription from checkout metadata so the charge is never dropped.
    if (
      subscription?.businessProfileId &&
      data.subscription_id &&
      !subscription.providerSubscriptionId
    ) {
      const businessProfileId = subscription.businessProfileId;
      subscription = await db.subscription.update({
        where: { id: subscription.id },
        data: { providerSubscriptionId: data.subscription_id, status: "active" },
      });
      await db.businessProfile.update({
        where: { id: businessProfileId },
        data: { plan: "PRO" },
      });
    }
    if (!subscription && data.subscription_id) {
      const metadata = data.metadata ?? {};
      const businessProfile = await resolveWebhookBusinessProfile(
        metadata.userId,
        metadata.businessProfileId,
      );
      if (businessProfile) {
        const current = await db.subscription.findUnique({
          where: { businessProfileId: businessProfile.id },
          select: {
            provider: true,
            providerSubscriptionId: true,
            providerCheckoutId: true,
            billingMode: true,
          },
        });
        if (!current && (await getGatewayContext(context.gateway)).mode !== context.mode) return;
        if (
          current &&
          (!(await subscriptionMatchesMode(current, context)) ||
            current.provider !== "dodo" ||
            (current.providerSubscriptionId &&
              current.providerSubscriptionId !== data.subscription_id) ||
            (current.providerCheckoutId &&
              data.checkout_session_id &&
              current.providerCheckoutId !== data.checkout_session_id))
        ) {
          return;
        }
        subscription = await db.subscription.upsert({
          where: { businessProfileId: businessProfile.id },
          create: {
            userId: metadata.userId,
            businessProfileId: businessProfile.id,
            provider: "dodo",
            billingMode: context.mode,
            providerCustomerId: data.customer?.customer_id,
            providerSubscriptionId: data.subscription_id,
            providerProductId: data.product_cart?.[0]?.product_id,
            providerCheckoutId: data.checkout_session_id,
            status: "active",
          },
          update: {
            provider: "dodo",
            billingMode: context.mode,
            providerCustomerId: data.customer?.customer_id,
            providerSubscriptionId: data.subscription_id,
            providerProductId: data.product_cart?.[0]?.product_id,
            providerCheckoutId: data.checkout_session_id,
            status: "active",
          },
        });
        await db.businessProfile.update({
          where: { id: businessProfile.id },
          data: { plan: "PRO" },
        });
      }
    }
    if (!subscription || !data.payment_id) return;
    const existingPayment = await db.payment.findUnique({
      where: {
        provider_providerPaymentId: { provider: "dodo", providerPaymentId: data.payment_id },
      },
      select: { status: true, billingMode: true },
    });
    if (existingPayment && !(await subscriptionMatchesMode(existingPayment, context))) return;
    await db.payment.upsert({
      where: {
        provider_providerPaymentId: { provider: "dodo", providerPaymentId: data.payment_id },
      },
      create: {
        userId: subscription.userId,
        businessProfileId: subscription.businessProfileId,
        subscriptionId: subscription.id,
        provider: "dodo",
        billingMode: context.mode,
        providerPaymentId: data.payment_id,
        providerInvoiceId: data.invoice_id,
        amount: minorToMajor(data.total_amount ?? 0, data.currency),
        currency: String(data.currency ?? "usd").toUpperCase(),
        status: "captured",
        method: data.payment_method ?? "dodo",
        capturedAt: new Date(),
      },
      update: {
        status: ["refunded", "partially_refunded"].includes(existingPayment?.status ?? "")
          ? existingPayment!.status
          : "captured",
        capturedAt: new Date(),
      },
    });
    return;
  }
  if (event.type === "payment.failed" && data.payment_id) {
    await db.payment.updateMany({
      where: { provider: "dodo", providerPaymentId: data.payment_id, billingMode: context.mode },
      data: { status: "failed" },
    });
    return;
  }
  if (event.type === "refund.succeeded" && data.payment_id) {
    const dodo = await getDodoClient({ mode: context });
    if (!dodo) throw new Error("Dodo Payments API key is not configured.");
    // Reconcile from Dodo's current payment instead of adding the webhook amount:
    // the same event may run again if delivery logging failed after the ledger update.
    const providerPayment = await dodo.payments.retrieve(data.payment_id);
    let payment = await db.payment.findUnique({
      where: {
        provider_providerPaymentId: { provider: "dodo", providerPaymentId: data.payment_id },
      },
    });
    if (!payment && providerPayment.status === "succeeded") {
      await processDodoEvent({ type: "payment.succeeded", data: providerPayment }, context);
      payment = await db.payment.findUnique({
        where: {
          provider_providerPaymentId: { provider: "dodo", providerPaymentId: data.payment_id },
        },
      });
    }
    if (payment && !(await subscriptionMatchesMode(payment, context))) return;
    if (!payment) {
      if (providerPayment.metadata?.businessProfileId) {
        throw new Error("Dodo payment ledger is not available yet; retry the refund event.");
      }
      return;
    }
    const succeededRefunds = providerPayment.refunds.filter(
      (refund) => refund.status === "succeeded",
    );
    if (
      providerPayment.refund_status !== "full" &&
      succeededRefunds.some((refund) => refund.amount == null)
    ) {
      throw new Error("Dodo did not report the amount of a partial refund.");
    }
    const refundedMinor = succeededRefunds.reduce(
      (total, refund) => total + (refund.amount ?? 0),
      0,
    );
    const refundedAmount =
      providerPayment.refund_status === "full"
        ? Number(payment.amount)
        : minorToMajor(refundedMinor, payment.currency);
    await db.payment.update({
      where: { id: payment.id },
      data: {
        refundedAmount,
        status: refundedAmount >= Number(payment.amount) ? "refunded" : "partially_refunded",
      },
    });
  }
}

function externalId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof (value as any).id === "string"
  ) {
    return (value as any).id;
  }
  return null;
}

function stripeInvoiceSubscriptionId(invoice: any): string | null {
  return (
    externalId(invoice?.subscription) ??
    externalId(invoice?.parent?.subscription_details?.subscription) ??
    externalId(invoice?.subscription_details?.subscription)
  );
}

function stripePeriodEnd(subscription: any): Date | null {
  const timestamps = [
    subscription?.current_period_end,
    ...(Array.isArray(subscription?.items?.data)
      ? subscription.items.data.map((item: any) => item.current_period_end)
      : []),
  ].filter((value): value is number => typeof value === "number");
  return timestamps.length ? new Date(Math.max(...timestamps) * 1000) : null;
}

function minorToMajor(amount: number, currency?: string): number {
  const zeroDecimal = new Set([
    "bif",
    "clp",
    "djf",
    "gnf",
    "jpy",
    "kmf",
    "krw",
    "mga",
    "pyg",
    "rwf",
    "ugx",
    "vnd",
    "vuv",
    "xaf",
    "xof",
    "xpf",
  ]);
  const threeDecimal = new Set(["bhd", "iqd", "jod", "kwd", "lyd", "omr", "tnd"]);
  const normalized = String(currency).toLowerCase();
  return amount / (zeroDecimal.has(normalized) ? 1 : threeDecimal.has(normalized) ? 1_000 : 100);
}

async function resolveWebhookBusinessProfile(userId?: string, requestedId?: string) {
  if (requestedId) {
    const requested = await db.businessProfile.findFirst({
      where: { id: requestedId, ...(userId ? { userId } : {}) },
      select: { id: true },
    });
    if (requested) return requested;
    return null;
  }
  if (!userId) return null;
  return db.businessProfile.findFirst({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
}

async function webhookMayUpdateWorkspace(
  businessProfileId: string,
  context: GatewayContext,
  externalSubscriptionId?: string | null,
  checkoutId?: string,
) {
  const current = await db.subscription.findUnique({ where: { businessProfileId } });
  if (!current) return (await getGatewayContext(context.gateway)).mode === context.mode;
  return (
    (await subscriptionMatchesMode(current, context)) &&
    current.provider === context.gateway &&
    (!current.providerSubscriptionId ||
      current.providerSubscriptionId === externalSubscriptionId) &&
    (!checkoutId || !current.providerCheckoutId || current.providerCheckoutId === checkoutId)
  );
}
