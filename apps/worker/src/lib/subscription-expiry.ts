import { db } from "@actorconsole/db";
import { EXPIRING_SUBSCRIPTION_STATUSES, providerSubscriptionPlan } from "@actorconsole/shared";

export async function reconcileExpiredSubscriptions(now = new Date(), prepaidOnly = false) {
  const candidates = await db.subscription.findMany({
    where: {
      currentPeriodEnd: { lte: now },
      businessProfileId: { not: null },
      ...(prepaidOnly
        ? { provider: "codingfrontend", status: "active" }
        : {
            OR: [
              { provider: "manual", status: "active" },
              { provider: "codingfrontend", status: "active" },
              { provider: "razorpay", status: { in: ["active", "pending"] } },
              { status: { in: [...EXPIRING_SUBSCRIPTION_STATUSES] } },
            ],
          }),
    },
  });
  let expired = 0;
  for (const subscription of candidates) {
    if (!subscription.businessProfileId) continue;
    if (
      subscription.provider !== "manual" &&
      providerSubscriptionPlan(
        subscription.provider,
        subscription.status,
        subscription.currentPeriodEnd,
        now,
        subscription.paymentBacked,
        subscription.source,
      ) !== "FREE"
    )
      continue;
    expired += await db.$transaction(async (tx) => {
      const claim = await tx.subscription.updateMany({
        where: {
          id: subscription.id,
          businessProfileId: subscription.businessProfileId,
          provider: subscription.provider,
          providerSubscriptionId: subscription.providerSubscriptionId,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          stateVersion: subscription.stateVersion,
          updatedAt: subscription.updatedAt,
        },
        data: { status: "expired", cancelAtPeriodEnd: true, stateVersion: { increment: 1 } },
      });
      if (!claim.count) return 0;
      await tx.businessProfile.update({
        where: { id: subscription.businessProfileId! },
        data: { plan: "FREE" },
      });
      return 1;
    });
  }
  return expired;
}
