import { db, type Prisma } from "@actorconsole/db";

const FINAL_PAYMENTS = ["refunded", "partially_refunded"];

/** A replay can fill a missing capture, but cannot undo a concurrently saved refund. */
export async function recordPaymentCapture(input: Prisma.PaymentUpsertArgs) {
  const payment = await db.payment.upsert({ ...input, update: {} });
  if (!payment.id) throw new Error("Payment capture did not return a ledger ID");
  await db.payment.updateMany({
    where: {
      id: payment.id,
      billingMode: input.create.billingMode,
      status: { notIn: FINAL_PAYMENTS },
    },
    data: { status: input.create.status, capturedAt: input.create.capturedAt },
  });
}
