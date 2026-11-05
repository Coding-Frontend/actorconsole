import { db, Prisma, queuePaymentAnalytics } from "@actorconsole/db";

const FINAL_PAYMENTS = ["refunded", "partially_refunded"];

/** A replay can fill a missing capture, but cannot undo a concurrently saved refund. */
export async function recordPaymentCapture(
  input: Omit<Prisma.PaymentUpsertArgs, "create"> & {
    create: Prisma.PaymentUncheckedCreateInput;
  },
  occurredAt?: Date,
) {
  const subscription = input.create.subscriptionId
    ? await db.subscription.findUnique({
        where: { id: input.create.subscriptionId },
      })
    : null;
  const payment = await db.payment.upsert({
    ...input,
    create: {
      ...input.create,
      ...(subscription?.analyticsAttributionId
        ? { analyticsAttributionId: subscription.analyticsAttributionId }
        : {}),
    },
    update: {},
  });
  if (!payment.id)
    throw new Error("Payment capture did not return a ledger ID");
  await db.payment.updateMany({
    where: {
      id: payment.id,
      billingMode: input.create.billingMode,
      status: { notIn: FINAL_PAYMENTS },
    },
    data: { status: input.create.status, capturedAt: input.create.capturedAt },
  });
  if (payment.analyticsAttributionId && input.create.status === "captured")
    await queuePaymentAnalytics(
      db,
      payment,
      "purchase",
      Number(payment.amount),
      occurredAt ?? payment.capturedAt ?? new Date(),
    );
}

/** Apply a verified cumulative refund and queue only its increase, atomically. */
export async function recordPaymentRefund(
  paymentId: string,
  cumulativeAmount: number,
  occurredAt = new Date(),
) {
  if (!Number.isFinite(cumulativeAmount) || cumulativeAmount < 0)
    throw new Error("Invalid provider refund amount");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM Payment WHERE id = ${paymentId} FOR UPDATE`,
    );
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment)
      throw new Error("Payment ledger is unavailable; retry the refund");
    const total = new Prisma.Decimal(cumulativeAmount);
    if (total.gt(new Prisma.Decimal(payment.amount)))
      throw new Error("Refund exceeds the captured payment");
    const previous = new Prisma.Decimal(payment.refundedAmount ?? 0);
    const analyticsPrevious = new Prisma.Decimal(
      payment.analyticsRefundedAmount ?? 0,
    );
    const ledgerAdvanced = total.gt(previous);
    const analyticsAdvanced =
      Boolean(payment.analyticsAttributionId) && total.gt(analyticsPrevious);
    if (!ledgerAdvanced && !analyticsAdvanced) return;
    if (ledgerAdvanced)
      await tx.payment.updateMany({
        where: {
          id: paymentId,
          OR: [
            { refundedAmount: null },
            { refundedAmount: { lte: cumulativeAmount } },
          ],
        },
        data: {
          refundedAmount: cumulativeAmount,
          status: total.eq(payment.amount) ? "refunded" : "partially_refunded",
        },
      });
    // Admin refund requests can update the financial ledger before the provider
    // confirms settlement. Track confirmed Analytics progress independently.
    if (analyticsAdvanced) {
      await queuePaymentAnalytics(
        tx,
        payment,
        "refund",
        total.sub(analyticsPrevious).toNumber(),
        occurredAt,
        total.toFixed(3),
      );
      await tx.payment.update({
        where: { id: payment.id },
        data: { analyticsRefundedAmount: cumulativeAmount },
      });
    }
  });
}
