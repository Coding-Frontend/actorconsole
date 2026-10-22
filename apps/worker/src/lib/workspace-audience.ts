import { db } from "@actorconsole/db";
import { collectWorkspaceAudience, getUserApifyClient } from "@actorconsole/apify";

export async function refreshWorkspaceAudience(input: {
  userId: string;
  businessProfileId: string;
}) {
  const where = { id: input.businessProfileId, userId: input.userId };
  const workspace = await db.businessProfile.findFirst({
    where,
    select: { id: true, apifyMonthlyUsers: true },
  });
  if (!workspace) throw new Error("Workspace is unavailable for audience synchronization");
  const apify = await getUserApifyClient(input.userId, input.businessProfileId);
  if (!apify) throw new Error("Connect Apify to synchronize workspace audience");
  const audience = await collectWorkspaceAudience(apify);
  const updateAudience =
    audience.monthlyUsers !== null &&
    (audience.monthlyUsersComplete || workspace.apifyMonthlyUsers == null);
  await db.businessProfile.updateMany({
    where,
    data: {
      apifyActorCount: audience.actorCount,
      ...(updateAudience
        ? {
            apifyMonthlyUsers: audience.monthlyUsers,
            apifyMonthlyUsersComplete: audience.monthlyUsersComplete,
          }
        : {}),
      planUsageCheckedAt: new Date(),
    },
  });
  return audience;
}
