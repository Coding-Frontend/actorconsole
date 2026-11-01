import { db } from "@actorconsole/db";

export async function claimManualPublishingRun(
  id: string,
  schedule: {
    id: string;
    userId: string;
    businessProfileId: string;
  },
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const where = {
      id,
      scheduleId: schedule.id,
      userId: schedule.userId,
      businessProfileId: schedule.businessProfileId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    };
    const grant = await tx.bulkPublishManualRun.findFirst({ where });
    if (!grant) return false;
    const owner = await tx.user.findFirst({
      where: { id: schedule.userId, suspendedAt: null, deletionScheduledFor: null },
      select: { id: true },
    });
    if (!owner) return false;
    if (grant.apiKeyId) {
      const key = await tx.apiKey.findFirst({
        where: {
          id: grant.apiKeyId,
          userId: schedule.userId,
          businessProfileId: schedule.businessProfileId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { scopes: true },
      });
      if (!key) return false;
      const scopes = Array.isArray(key.scopes)
        ? key.scopes.filter((scope): scope is string => typeof scope === "string")
        : [];
      if (scopes.some((scope) => scope.includes(":")) && !scopes.includes("publishing:run"))
        return false;
    }
    const claim = await tx.bulkPublishManualRun.updateMany({
      where,
      data: { consumedAt: new Date() },
    });
    return claim.count === 1;
  });
}
