import { db, type Prisma } from "@actorconsole/db";
import { watchSignals, type WatchMetrics } from "@actorconsole/shared";

/** Baseline and notification commit together, making repeated sync jobs quiet. */
export async function refreshStoreWatchAlerts() {
  let cursor: string | undefined;
  let checked = 0;
  while (true) {
    const watches = await db.storeWatch.findMany({
      take: 200,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        storeActor: true,
        businessProfile: {
          select: { userId: true, notificationPreference: { select: { product: true } } },
        },
      },
    });
    if (!watches.length) break;
    for (const watch of watches) {
      const actor = watch.storeActor;
      const observedAt =
        actor.detailsSyncedAt && actor.detailsSyncedAt > actor.lastSeenAt
          ? actor.detailsSyncedAt
          : actor.lastSeenAt;
      if (observedAt <= watch.checkedAt) continue;
      const rank =
        actor.users30Days == null || !actor.isPublic || actor.isDeprecated
          ? null
          : 1 +
            (await db.storeActor.count({
              where: {
                isPublic: true,
                isDeprecated: false,
                apifyActorId: { not: { contains: "/" } },
                OR: [
                  { users30Days: { gt: actor.users30Days } },
                  { users30Days: actor.users30Days, id: { lt: actor.id } },
                ],
              },
            }));
      const metrics: WatchMetrics = {
        users30Days: actor.users30Days,
        runs30Days: actor.runs30Days,
        reviewRating: actor.reviewRating,
        pricing: actor.pricingInfos,
        isPublic: actor.isPublic,
        rank,
      };
      const signals = watchSignals(watch.baseline as unknown as WatchMetrics, metrics);
      await db.$transaction(async (tx) => {
        const updated = await tx.storeWatch.updateMany({
          where: { id: watch.id, checkedAt: watch.checkedAt },
          data: { baseline: metrics as unknown as Prisma.InputJsonValue, checkedAt: observedAt },
        });
        if (!updated.count) return;
        if (
          watch.alertsEnabled &&
          watch.businessProfile.notificationPreference?.product !== false &&
          signals.length
        )
          await tx.notification.upsert({
            where: { dedupeKey: `store-watch:${watch.id}:${observedAt.toISOString()}` },
            create: {
              userId: watch.businessProfile.userId,
              businessProfileId: watch.businessProfileId,
              type: "store-watch",
              title: `${actor.title ?? actor.actorName} changed`,
              body: signals.join("\n"),
              link: `/dashboard/watchlist`,
              dedupeKey: `store-watch:${watch.id}:${observedAt.toISOString()}`,
            },
            update: {},
          });
      });
      checked++;
    }
    cursor = watches[watches.length - 1]!.id;
  }
  return checked;
}
