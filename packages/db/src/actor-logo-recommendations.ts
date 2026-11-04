import type { Prisma } from "@prisma/client";
import { db } from "./client.js";

/** Keep recommendations in step with Actor assignments, including logos that
 * were activated before an Actor was imported. Preserve Apply/Dismiss choices. */
export async function reconcileActorLogoRecommendations(
  where: Prisma.ActorWhereInput = {},
  client: Prisma.TransactionClient = db,
) {
  let cursor: string | undefined;
  let created = 0;
  while (true) {
    const actors = await client.actor.findMany({
      where,
      orderBy: { id: "asc" },
      take: 250,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        apifyRemovedAt: true,
        websiteIdentity: {
          select: {
            status: true,
            currentLogo: { select: { id: true, reviewStatus: true } },
          },
        },
      },
    });
    if (!actors.length) break;

    const groups = new Map<string | null, string[]>();
    for (const actor of actors) {
      const website = actor.websiteIdentity;
      const logoId =
        !actor.apifyRemovedAt &&
        website?.status === "ACTIVE" &&
        website.currentLogo?.reviewStatus === "APPROVED"
          ? website.currentLogo.id
          : null;
      const ids = groups.get(logoId) ?? [];
      ids.push(actor.id);
      groups.set(logoId, ids);
    }

    for (const [logoId, actorIds] of groups) {
      await client.actorLogoRecommendation.updateMany({
        where: {
          actorId: { in: actorIds },
          status: "PENDING",
          ...(logoId ? { logoId: { not: logoId } } : {}),
        },
        data: { status: "SUPERSEDED", error: null },
      });
      if (!logoId) continue;
      // A reassignment or logo rollback can make a superseded version current
      // again. Explicitly dismissed and already applied versions stay closed.
      await client.actorLogoRecommendation.updateMany({
        where: { actorId: { in: actorIds }, logoId, status: "SUPERSEDED" },
        data: { status: "PENDING", error: null },
      });
      const result = await client.actorLogoRecommendation.createMany({
        data: actorIds.map((actorId) => ({ actorId, logoId })),
        skipDuplicates: true,
      });
      created += result.count;
    }
    cursor = actors.at(-1)!.id;
  }
  return { created };
}
