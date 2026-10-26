import { db, Prisma } from "@actorconsole/db";

const PROCESSING_LEASE_MS = 5 * 60_000;

export interface PaymentWebhookLease {
  id: string;
  attemptedAt: Date;
}

/** Only processed deliveries may be acknowledged as duplicates. A failed or
 * interrupted attempt must remain recoverable when the provider retries. */
export async function claimPaymentWebhook(input: {
  source: string;
  externalId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<
  { state: "claimed"; lease: PaymentWebhookLease } | { state: "duplicate" | "in_progress" }
> {
  const attemptedAt = new Date();
  const previous = input.externalId
    ? await db.webhookDelivery.findUnique({
        where: { source_externalId: { source: input.source, externalId: input.externalId } },
        select: { id: true, status: true, attemptedAt: true },
      })
    : null;
  if (previous?.status === "processed") return { state: "duplicate" };
  if (previous) {
    if (
      previous.status !== "failed" &&
      (previous.status !== "received" ||
        previous.attemptedAt.getTime() >= attemptedAt.getTime() - PROCESSING_LEASE_MS)
    )
      return { state: "in_progress" };
    // Even an immediate retry must have a different lease from its predecessor.
    const nextAttemptAt = new Date(
      Math.max(attemptedAt.getTime(), previous.attemptedAt.getTime() + 1),
    );
    const claim = await db.webhookDelivery.updateMany({
      where: { id: previous.id, status: previous.status, attemptedAt: previous.attemptedAt },
      data: { status: "received", error: null, attemptedAt: nextAttemptAt },
    });
    if (!claim.count) return { state: "in_progress" };
    return { state: "claimed", lease: { id: previous.id, attemptedAt: nextAttemptAt } };
  }
  try {
    const row = await db.webhookDelivery.create({
      data: {
        ...input,
        payload: input.payload as Prisma.InputJsonValue,
        status: "received",
        signatureOk: true,
        attemptedAt,
      },
      select: { id: true },
    });
    return { state: "claimed", lease: { id: row.id, attemptedAt } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { state: "in_progress" };
    }
    throw error;
  }
}

export async function completePaymentWebhook(lease: PaymentWebhookLease, responseMs?: number) {
  const result = await db.webhookDelivery.updateMany({
    where: { ...lease, status: "received" },
    data: { status: "processed", responseMs },
  });
  if (!result.count) throw new Error("Payment webhook processing lease changed; retry delivery.");
}

export async function failPaymentWebhook(lease: PaymentWebhookLease, error: unknown) {
  await db.webhookDelivery.updateMany({
    where: { ...lease, status: "received" },
    data: {
      status: "failed",
      error: (error instanceof Error ? error.message : String(error)).slice(0, 1_000),
    },
  });
}
