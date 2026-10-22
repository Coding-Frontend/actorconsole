import { Prisma, type Plan } from "@prisma/client";
import { actorInventoryAudience, workspacePlanUsage } from "@actorconsole/shared";
import { db } from "./client.js";

type ImportActor = {
  id: string;
  username: string;
  name: string;
  title: string | null;
  description: string | null;
  pictureUrl: string | null;
  modifiedAt?: string;
  createdAt?: string;
  stats: { totalUsers30Days?: number; monthlyUsers?: number; totalUsers?: number } | null;
};

/** Every inventory import uses the same workspace lock, including worker jobs.
 * Existing actors remain readable and refreshable after a threshold is crossed. */
export async function admitWorkspaceActors<T extends ImportActor>(
  userId: string,
  businessProfileId: string,
  inventory: readonly T[],
  options: { reconcile?: boolean } = {},
) {
  const items = [...new Map(inventory.map((actor) => [actor.id, actor])).values()];
  const { monthlyUsers, monthlyUsersComplete } = actorInventoryAudience(items);
  return db.$transaction(
    async (tx) => {
      const [profile] = await tx.$queryRaw<
        Array<{ plan: Plan; apifyMonthlyUsers: number | null }>
      >(Prisma.sql`
      SELECT plan, apifyMonthlyUsers FROM BusinessProfile WHERE id = ${businessProfileId} AND userId = ${userId} FOR UPDATE
    `);
      if (!profile) throw new Error("Workspace is unavailable for Actor import");
      const tracked = await tx.actor.findMany({
        where: { businessProfileId, userId },
        select: { apifyActorId: true },
      });
      const trackedIds = new Set(tracked.map((actor) => actor.apifyActorId));
      const liveIds = items.map((actor) => actor.id);
      const liveIdSet = new Set(liveIds);
      const existingCount = options.reconcile
        ? tracked.filter((actor) => liveIdSet.has(actor.apifyActorId)).length
        : tracked.length;
      if (options.reconcile) {
        // Callers must supply a complete, successfully fetched inventory.
        // An empty inventory also reconciles the last Actor's removal. Keep
        // historical rows and restore them if they reappear in this workspace.
        await tx.actor.updateMany({
          where: {
            businessProfileId,
            userId,
            apifyRemovedAt: null,
            ...(liveIds.length ? { apifyActorId: { notIn: liveIds } } : {}),
          },
          data: {
            apifyRemovedAt: new Date(),
            storeIsPublic: null,
            storeIsDeprecated: null,
            storeNotice: null,
            storeStatusSyncedAt: null,
          },
        });
        if (liveIds.length) {
          await tx.actor.updateMany({
            where: {
              businessProfileId,
              userId,
              apifyActorId: { in: liveIds },
              apifyRemovedAt: { not: null },
            },
            data: { apifyRemovedAt: null },
          });
        }
      }
      const reportedUsers = monthlyUsersComplete
        ? monthlyUsers
        : (profile.apifyMonthlyUsers ?? monthlyUsers);
      const usage = workspacePlanUsage(profile.plan, items.length, reportedUsers);
      const slots = usage.monthlyUserLimitExceeded
        ? 0
        : usage.actorLimit === null
          ? Number.POSITIVE_INFINITY
          : Math.max(0, usage.actorLimit - existingCount);
      const newActors = items
        .filter((actor) => !trackedIds.has(actor.id))
        .sort((left, right) => {
          const modified = Date.parse(right.modifiedAt ?? "") - Date.parse(left.modifiedAt ?? "");
          if (Number.isFinite(modified) && modified !== 0) return modified;
          const created = Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? "");
          if (Number.isFinite(created) && created !== 0) return created;
          return `${left.username}/${left.name}`.localeCompare(`${right.username}/${right.name}`);
        });
      const admitted = Number.isFinite(slots) ? newActors.slice(0, slots) : newActors;
      if (admitted.length) {
        await tx.actor.createMany({
          data: admitted.map((actor) => ({
            userId,
            businessProfileId,
            apifyActorId: actor.id,
            username: actor.username,
            actorName: actor.name,
            title: actor.title,
            description: actor.description,
            currentImageUrl: actor.pictureUrl,
          })),
        });
      }
      const selectedIds = new Set([...trackedIds, ...admitted.map((actor) => actor.id)]);
      await tx.businessProfile.update({
        where: { id: businessProfileId },
        data: {
          apifyActorCount: items.length,
          // Compact inventory responses must not clear detailed audience stats
          // or mark an unknown audience as recently checked.
          ...(monthlyUsers !== null && (monthlyUsersComplete || profile.apifyMonthlyUsers == null)
            ? {
                apifyMonthlyUsers: monthlyUsers,
                apifyMonthlyUsersComplete: monthlyUsersComplete,
                planUsageCheckedAt: new Date(),
              }
            : {}),
        },
      });
      return {
        items: items.filter((actor) => selectedIds.has(actor.id)),
        created: admitted.length,
        skipped: newActors.length - admitted.length,
        trackedCount: existingCount + admitted.length,
        plan: profile.plan,
        usage,
      };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}
