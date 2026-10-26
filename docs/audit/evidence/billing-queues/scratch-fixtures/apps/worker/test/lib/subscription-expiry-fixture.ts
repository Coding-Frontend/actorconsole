import { db } from "@actorconsole/db";
export async function reconcileExpiredSubscriptions() {
      const expired = await db.subscription.findMany({
        where: {
          currentPeriodEnd: { lt: new Date() },
          businessProfileId: { not: null },
          OR: [
            { provider: "manual", status: "active" },
            { status: { in: ["cancelled", "completed"] } },
          ],
        },
        select: { id: true, businessProfileId: true },
      });
      for (const subscription of expired) {
        if (!subscription.businessProfileId) continue;
        await db.$transaction([
          db.subscription.update({
            where: { id: subscription.id },
            data: { status: "expired", cancelAtPeriodEnd: true },
          }),
          db.businessProfile.update({
            where: { id: subscription.businessProfileId },
            data: { plan: "FREE" },
          }),
        ]);
      }
return expired.length;
}
