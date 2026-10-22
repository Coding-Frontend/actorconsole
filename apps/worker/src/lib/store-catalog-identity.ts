import { db, Prisma } from "@actorconsole/db";
import type { ApifyActorDetail, ApifyClientWrapper } from "@actorconsole/apify";

const identitySelect = {
  id: true, apifyActorId: true, username: true, actorName: true, isPublic: true,
  _count: { select: { watches: true } },
} as const;
type Identity = Prisma.StoreActorGetPayload<{ select: typeof identitySelect }>;
type IdentityDatabase = Pick<typeof db, "storeActor" | "$transaction">;

/** Free reused names by authoritative immutable ID; retain every row and relation. */
export async function reconcileStoreActorIdentity(
  apify: Pick<ApifyClientWrapper, "getActor">,
  rowId: string,
  detail: ApifyActorDetail,
  database: IdentityDatabase = db,
) {
  const changes = new Map<string, {
    before: Identity;
    after: { username: string; actorName: string; isPublic: boolean };
    canonicalId?: string;
  }>();
  const visit = async (row: Identity, live: ApifyActorDetail) => {
    if (live.id !== row.apifyActorId || !live.username || !live.name) {
      throw new Error(`Cannot verify catalog identity ${row.apifyActorId}`);
    }
    const after = { username: live.username, actorName: live.name, isPublic: live.isPublic ?? true };
    if (changes.has(row.id)) return;
    if (row.username === after.username && row.actorName === after.actorName) return;
    if ([...changes.values()].some((c) => c.after.username === after.username && c.after.actorName === after.actorName)) {
      throw new Error("Distinct immutable Actors claim the same Store listing");
    }
    changes.set(row.id, { before: { ...row, _count: { ...row._count } }, after });
    const owner = await database.storeActor.findUnique({
      where: { username_actorName: { username: after.username, actorName: after.actorName } },
      select: identitySelect,
    });
    if (!owner || owner.id === row.id || changes.has(owner.id)) return;
    if (owner.apifyActorId.includes("/")) {
      // A sitemap reference is not an immutable Actor. Keep its snapshots and
      // original reference (apifyActorId) while removing it from public totals.
      // Watched placeholders need an explicit watch reconciliation first.
      if (owner._count.watches > 0) throw new Error("Cannot archive a watched catalog placeholder");
      changes.set(owner.id, {
        before: { ...owner, _count: { ...owner._count } },
        after: { username: owner.username, actorName: `catalog-alias-${owner.id}`, isPublic: false },
        canonicalId: row.id,
      });
    } else {
      const ownerLive = await apify.getActor(owner.apifyActorId);
      if (!ownerLive) throw new Error(`Cannot verify listing owner ${owner.apifyActorId}`);
      await visit(owner, ownerLive);
      if (!changes.has(owner.id)) throw new Error("Current Store listing belongs to another immutable Actor");
    }
  };
  const row = await database.storeActor.findUnique({ where: { id: rowId }, select: identitySelect });
  if (!row) throw new Error("Catalog Actor disappeared during identity reconciliation");
  await visit(row, detail);
  if (!changes.size) return 0;

  await database.$transaction(async (tx) => {
    // Recheck under serializable isolation. Concurrent detail batches must
    // retry instead of applying a plan based on names another batch changed.
    for (const { before } of changes.values()) {
      const current = await tx.storeActor.findUnique({ where: { id: before.id }, select: identitySelect });
      if (!current || current.apifyActorId !== before.apifyActorId || current.username !== before.username || current.actorName !== before.actorName || current._count.watches !== before._count.watches) {
        throw new Error("Catalog identity changed; retry reconciliation");
      }
    }
    // Move the entire component aside first, so name swaps and longer cycles
    // satisfy the unique owner/name constraint throughout the transaction.
    for (const { before } of changes.values()) {
      await tx.storeActor.update({ where: { id: before.id }, data: { actorName: `catalog-move-${before.id}` } });
    }
    for (const { before, after, canonicalId } of changes.values()) {
      await tx.storeActor.update({ where: { id: before.id }, data: after });
      await tx.auditLog.create({ data: {
        action: "catalog.identity.reconciled", resource: `store-actor:${before.id}`, source: "worker",
        before: { apifyActorId: before.apifyActorId, username: before.username, actorName: before.actorName, isPublic: before.isPublic },
        after: { ...after, ...(canonicalId ? { canonicalStoreActorId: canonicalId } : {}) },
      } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return changes.size;
}
