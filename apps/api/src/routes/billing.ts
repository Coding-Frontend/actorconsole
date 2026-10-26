import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import Stripe from "stripe";
import { reconcileBillingSubscription } from "../lib/billing-state.js";
import { recordPaymentCapture } from "../lib/billing-payment-state.js";
import { providerAmount } from "../lib/billing-amount.js";
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
import {
  isDodoLivePaymentsUnavailable,
  isDefinitiveProviderRejection,
} from "../lib/billing-provider-errors.js";
import type { AppEnv } from "../app.js";

const checkoutBody = z
  .object({
    gateway: z.enum(["stripe", "razorpay", "dodo"]),
    plan: z.literal("PRO"),
    interval: z.enum(["month", "year"]),
  })
  .strict();

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

    if (existing && existing.provider === "manual" && subscriptionBlocksCheckout(existing)) {
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
    if (existing && subscriptionBlocksCheckout(existing)) {
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

    const operationId = await reserveBillingCheckout({
      businessProfileId: session.businessProfileId,
      userId: session.userId,
      context,
      productId: selectedProductId,
      interval,
    });
    let checkout;
    try {
      const actor = {
        userId: session.userId,
        businessProfileId: session.businessProfileId,
        email: user.email,
        name: user.name,
        operationId,
      };
      checkout = await createProviderCheckout(gateway, plan, actor, interval, context);
    } catch (error) {
      await failBillingCheckout(operationId, error);
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

    // A persistence failure after provider acceptance retains the reservation.
    await completeBillingCheckout(operationId, checkout);
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
    if (!subscription.providerSubscriptionId && !subscription.razorpaySubscriptionId) {
      return c.json(
        {
          ok: false,
          error: {
            code: "checkout_in_progress",
            message: "Reconcile the pending checkout before cancellation.",
          },
        },
        409,
      );
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
      where: {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: false,
        stateVersion: subscription.stateVersion ?? 0,
        providerSubscriptionId: subscription.providerSubscriptionId,
        updatedAt: subscription.updatedAt,
      },
      data: { status: "cancellation_pending", stateVersion: { increment: 1 } },
    });
    if (!claimed.count) {
      return c.json({ ok: false, error: { code: "subscription_changed" } }, 409);
    }
    let result;
    try {
      result = await cancelProviderSubscription(subscription);
    } catch (error) {
      if (isDefinitiveProviderRejection(error))
        await db.subscription.updateMany({
          where: {
            id: subscription.id,
            status: "cancellation_pending",
            cancelAtPeriodEnd: false,
            stateVersion: (subscription.stateVersion ?? 0) + 1,
          },
          data: { status: subscription.status, stateVersion: { increment: 1 } },
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
    // Provider webhooks may have already advanced the subscription while this
    // request was in flight. Never replace their newer state with this snapshot.
    await db.subscription.updateMany({
      where: {
        id: subscription.id,
        status: "cancellation_pending",
        cancelAtPeriodEnd: false,
        stateVersion: (subscription.stateVersion ?? 0) + 1,
      },
      data: {
        status: result.status,
        cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        stateVersion: { increment: 1 },
      },
    });
    const updated = await db.subscription.findUnique({ where: { id: subscription.id } });
    return c.json({ ok: true, data: updated });
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
    const claim = await claimPaymentWebhook({
      source,
      externalId: event.id,
      eventType: event.type,
      payload: summarizeStripeEvent(event),
    });
    if (claim.state === "duplicate") return c.json({ ok: true, duplicate: true });
    if (claim.state !== "claimed")
      return c.json({ ok: false, error: { code: "webhook_in_progress" } }, 503);
    try {
      await processStripeEvent(event, context);
      await completePaymentWebhook(claim.lease);
      return c.json({ ok: true });
    } catch (error) {
      await failPaymentWebhook(claim.lease, error);
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
    const claim = await claimPaymentWebhook({
      source,
      externalId: eventId,
      eventType: event.type,
      payload: {
        type: event.type,
        subscriptionId: event.data?.subscription_id,
        paymentId: event.data?.payment_id,
      },
    });
    if (claim.state === "duplicate") return c.json({ ok: true, duplicate: true });
    if (claim.state !== "claimed")
      return c.json({ ok: false, error: { code: "webhook_in_progress" } }, 503);
    try {
      await processDodoEvent(event, context);
      await completePaymentWebhook(claim.lease);
      return c.json({ ok: true });
    } catch (error) {
      await failPaymentWebhook(claim.lease, error);
      throw error;
    }
  });

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
    if (subscriptionId) {
      await reconcileBillingSubscription({
        context,
        id: subscriptionId,
        businessProfileId: businessProfile.id,
        userId: metadata.userId,
        checkoutId: object.id,
        provisionalCheckout: true,
      });
    } else {
      // Keep the established provisional policy, but never let an unlinked
      // checkout overwrite a subscription already confirmed by another event.
      await db.$transaction(async (tx) => {
        const { lockBillingWorkspace } = await import("../lib/billing-checkout-operations.js");
        await lockBillingWorkspace(tx, businessProfile.id);
        const current = await tx.subscription.findUnique({
          where: { businessProfileId: businessProfile.id },
        });
        if (
          current?.checkoutOperationId &&
          current.checkoutOperationId !== metadata.checkoutOperationId
        )
          return;
        if (
          current?.providerSubscriptionId ||
          (current &&
            (current.provider !== "stripe" ||
              !(await subscriptionMatchesMode(current, context)) ||
              (current.providerCheckoutId && current.providerCheckoutId !== object.id)))
        )
          return;
        await tx.subscription.upsert({
          where: { businessProfileId: businessProfile.id },
          create: {
            userId: metadata.userId,
            businessProfileId: businessProfile.id,
            provider: "stripe",
            billingMode: context.mode,
            providerCheckoutId: object.id,
            status: object.status ?? "complete",
          },
          update: {
            providerCheckoutId: object.id,
            status: object.status ?? "complete",
            stateVersion: { increment: 1 },
          },
        });
        await tx.businessProfile.update({
          where: { id: businessProfile.id },
          data: { plan: "PRO" },
        });
      });
    }
    return;
  }

  if (event.type.startsWith("customer.subscription.")) {
    const existing = await db.subscription.findUnique({
      where: {
        provider_providerSubscriptionId: { provider: "stripe", providerSubscriptionId: object.id },
      },
    });
    const businessProfile = existing?.businessProfileId
      ? { id: existing.businessProfileId }
      : await resolveWebhookBusinessProfile(
          object.metadata?.userId,
          object.metadata?.businessProfileId,
        );
    if (!businessProfile) return;
    await reconcileBillingSubscription({
      context,
      id: object.id,
      businessProfileId: businessProfile.id,
      userId: object.metadata?.userId,
    });
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
    await recordPaymentCapture({
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
        ...providerAmount(object.amount_paid ?? object.total, object.currency),
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
      where: {
        provider: "stripe",
        providerInvoiceId,
        billingMode: context.mode,
        status: { notIn: ["captured", "refunded", "partially_refunded"] },
      },
      data: { status: "failed" },
    });
  }
}

async function processDodoEvent(event: any, context: GatewayContext) {
  const data = event.data ?? {};
  if (data.metadata?.billingMode && data.metadata.billingMode !== context.mode) return;
  if (event.type.startsWith("subscription.")) {
    if (!data.subscription_id) return;
    const existing = await db.subscription.findUnique({
      where: {
        provider_providerSubscriptionId: {
          provider: "dodo",
          providerSubscriptionId: data.subscription_id,
        },
      },
    });
    const businessProfile = existing?.businessProfileId
      ? { id: existing.businessProfileId }
      : await resolveWebhookBusinessProfile(
          data.metadata?.userId,
          data.metadata?.businessProfileId,
        );
    if (!businessProfile) return;
    await reconcileBillingSubscription({
      context,
      id: data.subscription_id,
      businessProfileId: businessProfile.id,
      userId: data.metadata?.userId,
    });
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
    if (data.subscription_id && !subscription?.providerSubscriptionId) {
      const businessProfile = subscription?.businessProfileId
        ? { id: subscription.businessProfileId }
        : await resolveWebhookBusinessProfile(
            data.metadata?.userId,
            data.metadata?.businessProfileId,
          );
      if (businessProfile)
        subscription = await reconcileBillingSubscription({
          context,
          id: data.subscription_id,
          businessProfileId: businessProfile.id,
          userId: subscription?.userId ?? data.metadata?.userId,
          checkoutId: data.checkout_session_id,
        });
    }
    if (!subscription || !data.payment_id) return;
    const existingPayment = await db.payment.findUnique({
      where: {
        provider_providerPaymentId: { provider: "dodo", providerPaymentId: data.payment_id },
      },
      select: { status: true, billingMode: true },
    });
    if (existingPayment && !(await subscriptionMatchesMode(existingPayment, context))) return;
    await recordPaymentCapture({
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
        ...providerAmount(data.total_amount, data.currency),
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
      where: {
        provider: "dodo",
        providerPaymentId: data.payment_id,
        billingMode: context.mode,
        status: { notIn: ["captured", "refunded", "partially_refunded"] },
      },
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
        : providerAmount(refundedMinor, payment.currency).amount;
    await db.payment.updateMany({
      where: {
        id: payment.id,
        OR: [{ refundedAmount: null }, { refundedAmount: { lte: refundedAmount } }],
      },
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
