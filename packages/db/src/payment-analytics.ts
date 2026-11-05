import { createHash, randomUUID } from "node:crypto";
import { Prisma, type Payment } from "@prisma/client";
import { db } from "./client.js";
import { context } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const DAY = 86_400_000;
const MAX_AGE = 3 * DAY;

export interface PaymentAnalyticsInput {
  consent: true;
  token: string;
  clientId: string;
  measurementId: string;
  sessionId?: string;
}

/** Immutable checkout attribution. A revocation received first wins the race. */
export async function bindPaymentAnalyticsAttribution(
  tx: Prisma.TransactionClient,
  input: PaymentAnalyticsInput | undefined,
  userId: string,
  interval: string,
) {
  if (
    !input ||
    input.consent !== true ||
    !process.env.GA4_MEASUREMENT_ID ||
    input.measurementId !== process.env.GA4_MEASUREMENT_ID
  )
    return null;
  const row = await tx.paymentAnalyticsAttribution.upsert({
    where: { id: hash(input.token) },
    create: {
      id: hash(input.token),
      userId,
      clientId: input.clientId,
      sessionId: input.sessionId,
      measurementId: input.measurementId,
      interval,
      expiresAt: new Date(Date.now() + 365 * DAY),
    },
    update: {},
  });
  return !row.revokedAt && row.userId === userId && row.expiresAt > new Date()
    ? row.id
    : null;
}

/** The opaque token authorizes revocation only; it cannot enable collection. */
export async function revokePaymentAnalytics(tokens: string[]) {
  for (const token of tokens) {
    const id = hash(token);
    const now = new Date();
    await db.paymentAnalyticsAttribution.upsert({
      where: { id },
      create: {
        id,
        revokedAt: now,
        expiresAt: new Date(now.getTime() + 365 * DAY),
      },
      update: { revokedAt: now, clientId: null, sessionId: null },
    });
  }
}

/** Store once per payment or cumulative refund checkpoint, before acknowledging the webhook. */
export async function queuePaymentAnalytics(
  tx: Prisma.TransactionClient,
  payment: Payment,
  name: "purchase" | "refund",
  value: number,
  occurredAt = new Date(),
  refundCheckpoint?: string,
) {
  if (
    !payment.analyticsAttributionId ||
    !Number.isFinite(value) ||
    value <= 0 ||
    !/^[A-Z]{3}$/.test(payment.currency) ||
    (payment.billingMode !== "live" &&
      !(
        payment.billingMode === "test" &&
        process.env.GA4_INCLUDE_TEST_PAYMENTS === "true"
      ))
  )
    return;
  const attribution = await tx.paymentAnalyticsAttribution.findUnique({
    where: { id: payment.analyticsAttributionId },
  });
  if (
    !attribution ||
    attribution.revokedAt ||
    !attribution.clientId ||
    attribution.userId !== payment.userId ||
    attribution.expiresAt <= new Date()
  )
    return;
  const id = hash(`${name}:${payment.id}:${refundCheckpoint ?? ""}`);
  await tx.paymentAnalyticsEvent.upsert({
    where: { id },
    create: {
      id,
      paymentId: payment.id,
      attributionId: attribution.id,
      name,
      value,
      currency: payment.currency,
      occurredAt,
    },
    update: {},
  });
}

/** Drain a bounded batch from either worker backend, independently of payment processing. */
export async function dispatchPaymentAnalytics(limit = 25) {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const secret = process.env.GA4_API_SECRET;
  if (!measurementId || !/^G-[A-Z0-9]+$/.test(measurementId) || !secret) return;
  const now = new Date();
  const rows = await db.paymentAnalyticsEvent.findMany({
    where: {
      OR: [
        { status: "pending", availableAt: { lte: now } },
        { status: { in: ["claimed", "sending"] }, leaseExpiresAt: { lt: now } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  for (const row of rows) {
    const leaseToken = randomUUID();
    const claimed = await db.paymentAnalyticsEvent.updateMany({
      where: {
        id: row.id,
        status: row.status,
        leaseToken: row.leaseToken,
        ...(row.status !== "pending" ? { leaseExpiresAt: { lt: now } } : {}),
      },
      data: {
        status: "claimed",
        leaseToken,
        leaseExpiresAt: new Date(Date.now() + 60_000),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) continue;
    const finish = async (status: string, lastError: string | null = null) => {
      await db.paymentAnalyticsEvent.updateMany({
        where: {
          id: row.id,
          leaseToken,
          status: { in: ["claimed", "sending"] },
        },
        data: {
          status,
          lastError,
          leaseToken: null,
          leaseExpiresAt: null,
          ...(status === "sent" ? { sentAt: new Date() } : {}),
          ...(status === "pending"
            ? {
                availableAt: new Date(
                  Date.now() +
                    Math.min(
                      3_600_000,
                      30_000 * 2 ** Math.min(row.attempts, 7),
                    ),
                ),
              }
            : {}),
        },
      });
    };
    // A crashed sender may already have delivered a refund. GA4 does not
    // document purchase-style transaction deduplication for partial refunds.
    if (row.status === "sending" && row.name === "refund") {
      await finish("uncertain", "delivery_interrupted");
      continue;
    }
    const attribution = await db.paymentAnalyticsAttribution.findUnique({
      where: { id: row.attributionId },
    });
    const payment = await db.payment.findUnique({
      where: { id: row.paymentId },
    });
    if (
      !attribution ||
      !payment ||
      attribution.revokedAt ||
      !attribution.clientId ||
      attribution.expiresAt <= new Date() ||
      attribution.measurementId !== measurementId ||
      attribution.userId !== payment.userId ||
      (payment.billingMode !== "live" &&
        !(
          payment.billingMode === "test" &&
          process.env.GA4_INCLUDE_TEST_PAYMENTS === "true"
        ))
    ) {
      await finish("discarded", "consent_or_stream_unavailable");
      continue;
    }
    const age = Date.now() - row.occurredAt.getTime();
    if (
      age > MAX_AGE ||
      age < -60_000 ||
      !["purchase", "refund"].includes(row.name)
    ) {
      await finish("discarded", "event_expired_or_invalid");
      continue;
    }
    if (row.name === "refund") {
      const purchase = await db.paymentAnalyticsEvent.findFirst({
        where: { paymentId: row.paymentId, name: "purchase" },
      });
      if (!purchase || ["discarded", "uncertain"].includes(purchase.status)) {
        await finish("discarded", "purchase_not_delivered");
        continue;
      }
      if (purchase.status !== "sent") {
        await finish("pending");
        continue;
      }
    }
    const value = Number(row.value);
    const transactionId = `ac_${hash(payment.id)}`;
    // Sessions are only attached within 24 hours of their start; renewals and
    // later refunds keep the client identity without extending an old session.
    const session =
      attribution.sessionId &&
      row.occurredAt.getTime() - Number(attribution.sessionId) * 1000 >= 0 &&
      row.occurredAt.getTime() - Number(attribution.sessionId) * 1000 < DAY
        ? { session_id: Number(attribution.sessionId) }
        : {};
    const payload = {
      client_id: attribution.clientId,
      timestamp_micros: row.occurredAt.getTime() * 1000,
      consent: { ad_user_data: "DENIED", ad_personalization: "DENIED" },
      events: [
        {
          name: row.name,
          params: {
            transaction_id: transactionId,
            event_id: row.id,
            currency: row.currency,
            value,
            gateway: payment.provider,
            payment_mode: payment.billingMode,
            billing_interval: attribution.interval,
            ...session,
            // Refund checkpoints may be partial. Omitting items avoids marking
            // a whole subscription item as refunded for every partial amount.
            ...(row.name === "purchase"
              ? {
                  items: [
                    {
                      item_id: "pro",
                      item_name: "Pro",
                      item_variant: attribution.interval,
                      price: value,
                      quantity: 1,
                    },
                  ],
                }
              : {}),
            ...(payment.billingMode === "test" ? { debug_mode: true } : {}),
          },
        },
      ],
    };
    let attempted = false;
    try {
      const ready = await db.paymentAnalyticsEvent.updateMany({
        where: {
          id: row.id,
          leaseToken,
          status: "claimed",
          leaseExpiresAt: { gt: new Date() },
        },
        data: { status: "sending" },
      });
      if (!ready.count) continue;
      const url = new URL("https://www.google-analytics.com/mp/collect");
      url.searchParams.set("measurement_id", measurementId);
      url.searchParams.set("api_secret", secret);
      attempted = true;
      // Prevent automatic HTTP/fetch tracing from exporting the secret query.
      const response = await context.with(
        suppressTracing(context.active()),
        () =>
          fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5_000),
          }),
      );
      if (response.ok) await finish("sent");
      else if (response.status === 429) await finish("pending", "rate_limited");
      else if (response.status >= 500)
        await finish(
          row.name === "refund" ? "uncertain" : "pending",
          "upstream_error",
        );
      else await finish("discarded", `http_${response.status}`);
    } catch {
      // Never log the request URL: it contains the server's API secret.
      await finish(
        row.name === "refund" && attempted ? "uncertain" : "pending",
        "transport_error",
      );
    }
  }
}
