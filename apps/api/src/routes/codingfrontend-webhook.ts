import type { Context } from "hono";
import { z } from "zod";
import { db, queuePaymentAnalytics } from "@actorconsole/db";
import { lockBillingWorkspace } from "../lib/billing-checkout-operations.js";
import { codingFrontendSecretKey, verifyCodingFrontendEvent } from "../lib/codingfrontend-checkout.js";
import { getGatewayContext, getPaymentSetting, isPaymentMode } from "../lib/payment-gateway-settings.js";
import { claimPaymentWebhook, completePaymentWebhook, failPaymentWebhook } from "../lib/payment-webhook-delivery.js";
import type { AppEnv } from "../app.js";

const provider = "codingfrontend";
const eventData = z.object({
  checkout_id: z.string().regex(/^[a-f0-9]{32}$/),
  plan: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  payment_id: z.string().regex(/^pay_[a-zA-Z0-9]+$/).max(64),
  amount: z.number().int().min(100).max(100_000_000),
  currency: z.enum(["USD", "INR"]),
  mode: z.enum(["test", "live"]),
  paid_at: z.string().datetime(),
});
const eventSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("checkout.paid"), data: eventData }),
  z.object({
    id: z.string(), type: z.literal("checkout.complimentary"),
    data: eventData.extend({
      payment_id: z.null(), amount: z.literal(0), payment_required: z.literal(false),
      subtotal: z.number().int().min(100).max(100_000_000),
      discount: z.number().int().min(100).max(100_000_000),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal("checkout.refunded"),
    data: eventData.extend({ refunded_amount: z.number().int().positive() }),
  }),
]);
type CheckoutEventData = z.infer<typeof eventSchema>["data"];

function periodEnd(paidAt: Date, interval: "month" | "year") {
  const end = new Date(paidAt);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + (interval === "year" ? 12 : 1));
  const month = end.getUTCMonth();
  end.setUTCMonth(month + 1, 0);
  end.setUTCDate(Math.min(day, end.getUTCDate()));
  return end;
}

export async function codingFrontendWebhook(c: Context<AppEnv>) {
  const mode = c.req.query("mode");
  if (!isPaymentMode(mode)) return c.json({ ok: false }, 400);
  const raw = Buffer.from(await c.req.arrayBuffer());
  if (raw.length > 8192) return c.json({ ok: false }, 413);
  const context = await getGatewayContext(provider, mode);
  const verifiedIntervals = (await Promise.all((["month", "year"] as const).map(async (interval) => {
    const secret = await getPaymentSetting(codingFrontendSecretKey(interval), context);
    return secret && verifyCodingFrontendEvent(
      secret, c.req.header("x-codingfrontend-timestamp"), raw, c.req.header("x-codingfrontend-signature"),
    ) ? interval : null;
  }))).filter((interval) => interval !== null);
  if (!verifiedIntervals.length) return c.json({ ok: false }, 401);

  let json: unknown;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    return c.json({ ok: false }, 400);
  }
  const result = eventSchema.safeParse(json);
  if (!result.success) return c.json({ ok: false }, 400);
  const { id, type, data } = result.data;
  const refunded = type === "checkout.refunded" ? result.data.data.refunded_amount : 0;
  const paidAt = new Date(data.paid_at);
  const expectedId = `${type}:${data.checkout_id}${refunded ? `:${refunded}` : ""}`;
  if (id !== expectedId || data.mode !== mode || refunded > data.amount ||
      ("subtotal" in data && data.subtotal !== data.discount) ||
      paidAt.getTime() > Date.now() + 5 * 60_000)
    return c.json({ ok: false }, 400);

  const claim = await claimPaymentWebhook({
    source: `${provider}:${mode}`,
    externalId: id,
    eventType: type,
    payload: { checkoutId: data.checkout_id, paymentId: data.payment_id, amount: data.amount, currency: data.currency,
      ...("subtotal" in data ? { subtotal: data.subtotal, discount: data.discount } : {}) },
  });
  if (claim.state === "duplicate") return c.json({ ok: true });
  if (claim.state !== "claimed") return c.json({ ok: false }, 503);
  try {
    const applied = await applyEvent(data, mode, refunded, verifiedIntervals);
    if (!applied) {
      await failPaymentWebhook(claim.lease, new Error("Payment does not match a completed or pending ActorConsole checkout."));
      return c.json({ ok: false }, 409);
    }
    await completePaymentWebhook(claim.lease);
    return c.json({ ok: true });
  } catch (error) {
    await failPaymentWebhook(claim.lease, error);
    throw error;
  }
}

async function applyEvent(
  data: CheckoutEventData,
  mode: "test" | "live",
  refunded: number,
  verifiedIntervals: Array<"month" | "year">,
) {
  const paidAt = new Date(data.paid_at);
  const complimentary = "subtotal" in data;
  const reservedAmount = complimentary ? data.subtotal : data.amount;
  const paymentKey = { provider, providerPaymentId: data.payment_id ?? `free_${data.checkout_id}` };
  const known = await db.payment.findUnique({ where: { provider_providerPaymentId: paymentKey } });
  const operation = await db.billingCheckoutOperation.findUnique({ where: { id: data.checkout_id } });
  const workspaceId = operation?.businessProfileId ?? known?.businessProfileId;
  if (!workspaceId) return false;

  return db.$transaction(async (tx) => {
    await lockBillingWorkspace(tx, workspaceId);
    const payment = await tx.payment.findUnique({ where: { provider_providerPaymentId: paymentKey } });
    const current = await tx.subscription.findUnique({ where: { businessProfileId: workspaceId } });
    if (payment) {
      const notes = payment.notes as { interval?: unknown; plan?: unknown; subtotal?: unknown } | null;
      if (payment.businessProfileId !== workspaceId || payment.billingMode !== mode ||
          payment.providerOrderId !== data.checkout_id ||
          Math.round(Number(payment.amount) * 100) !== data.amount || payment.currency !== data.currency ||
          notes?.plan !== data.plan || (complimentary && notes.subtotal !== reservedAmount) ||
          !verifiedIntervals.some((interval) => interval === notes.interval))
        return false;
      const previous = Math.round(Number(payment.refundedAmount ?? 0) * 100);
      if (refunded > previous) {
        const fullyRefunded = refunded === data.amount;
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            refundedAmount: refunded / 100,
            analyticsRefundedAmount: refunded / 100,
            status: fullyRefunded ? "refunded" : "partially_refunded",
          },
        });
        await queuePaymentAnalytics(tx, payment, "refund", (refunded - previous) / 100, new Date(), (refunded / 100).toFixed(3));
        if (fullyRefunded && current?.provider === provider && current.providerCheckoutId === data.checkout_id) {
          await tx.subscription.update({
            where: { id: current.id },
            data: { status: "refunded", currentPeriodEnd: new Date(), stateVersion: { increment: 1 } },
          });
          if (mode === "live")
            await tx.businessProfile.update({ where: { id: workspaceId }, data: { plan: "FREE" } });
        }
      }
      return true;
    }

    // If refund notification wins the race, request redelivery after capture is durable.
    if (refunded) return false;
    const pending = await tx.billingCheckoutOperation.findUnique({ where: { id: data.checkout_id } });
    if (!pending || pending.provider !== provider || pending.billingMode !== mode ||
        pending.businessProfileId !== workspaceId || pending.status !== "RESERVED" ||
        pending.productId !== data.plan || pending.amountMinor !== reservedAmount ||
        pending.currency !== data.currency || !verifiedIntervals.some((interval) => interval === pending.interval) ||
        !current || current.provider !== provider || current.checkoutOperationId !== pending.id ||
        current.status !== "checkout_pending" || current.billingMode !== mode ||
        paidAt.getTime() < pending.createdAt.getTime() - 5 * 60_000)
      return false;

    const end = periodEnd(paidAt, pending.interval === "year" ? "year" : "month");
    const active = end > new Date();
    const checkout = await tx.payment.create({
      data: {
        ...paymentKey, billingMode: mode, providerOrderId: data.checkout_id,
        businessProfileId: workspaceId, userId: pending.userId, subscriptionId: current.id,
        amount: data.amount / 100, currency: data.currency, status: complimentary ? "complimentary" : "captured",
        capturedAt: complimentary ? null : paidAt,
        description: `ActorConsole Pro (${pending.interval === "year" ? "yearly" : "monthly"} prepaid)`,
        notes: { interval: pending.interval, plan: data.plan, ...(complimentary ? { subtotal: reservedAmount } : {}) },
        analyticsAttributionId: complimentary ? null : current.analyticsAttributionId,
      },
    });
    if (!complimentary) await queuePaymentAnalytics(tx, checkout, "purchase", data.amount / 100, paidAt);
    await tx.subscription.update({
      where: { id: current.id },
      data: {
        status: mode === "test" ? "test_completed" : active ? "active" : "expired",
        currentPeriodEnd: mode === "live" ? end : null,
        providerCheckoutId: data.checkout_id,
        source: complimentary ? "coupon" : "gateway",
        paymentBacked: !complimentary,
        stateVersion: { increment: 1 },
      },
    });
    await tx.billingCheckoutOperation.update({
      where: { id: pending.id },
      data: { status: "SUCCEEDED", providerCheckoutId: data.checkout_id },
    });
    if (mode === "live" && active)
      await tx.businessProfile.update({ where: { id: workspaceId }, data: { plan: "PRO" } });
    return true;
  });
}
