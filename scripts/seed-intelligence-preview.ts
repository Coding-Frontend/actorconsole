/** Optional local preview fixtures. Refuses all databases except the isolated loopback preview. */
import { db } from "../packages/db/src/client";
import { hashPassword } from "../packages/db/src/password-auth";
async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^mysql:\/\/[^/]+@127\.0\.0\.1:3308\/actorconsole_intelligence_preview$/.test(url))
    throw new Error("Use the isolated loopback intelligence preview database.");
  const password = process.env.PREVIEW_SEED_PASSWORD;
  if (!password || password.length < 16)
    throw new Error(
      "Set PREVIEW_SEED_PASSWORD to an independent password of at least 16 characters.",
    );
  const userId = "intelligence-preview-user";
  const workspaceId = "intelligence-preview-workspace";
  await db.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      name: "Preview Builder",
      email: "intelligence-preview@example.test",
      plan: "PRO",
      emailVerified: new Date(),
      termsAcceptedAt: new Date(),
      privacyAcceptedAt: new Date(),
    },
    update: {},
  });
  await db.passwordCredential.upsert({
    where: { userId },
    create: { userId, passwordHash: await hashPassword(password) },
    update: {},
  });
  await db.businessProfile.upsert({
    where: { id: workspaceId },
    create: {
      id: workspaceId,
      userId,
      name: "Intelligence preview",
      slug: "intelligence-preview",
      isDefault: true,
      plan: "PRO",
      apifyActorCount: 3,
      apifyMonthlyUsers: 125,
      apifyMonthlyUsersComplete: true,
      planUsageCheckedAt: new Date(),
    },
    update: {},
  });
  await db.onboardingState.upsert({
    where: { businessProfileId: workspaceId },
    create: {
      userId,
      businessProfileId: workspaceId,
      profileComplete: true,
      actorImported: true,
      completedAt: new Date(),
      credentialsStepCompletedAt: new Date(),
      planStepCompletedAt: new Date(),
    },
    update: {},
  });
  for (let i = 0; i < 28; i++) {
    const title = [
      "Maps contact extractor",
      "Product review monitor",
      "Job listing collector",
      "Company research API",
    ][i % 4]!;
    const actor = await db.storeActor.upsert({
      where: { apifyActorId: `preview-public-${i}` },
      create: {
        apifyActorId: `preview-public-${i}`,
        username: "preview-builder",
        actorName: `preview-${i}`,
        title: `Preview · ${title} ${i + 1}`,
        description:
          "Local preview fixture. Collect structured data for research and monitoring workflows with configurable filters and JSON output.",
        isPublic: true,
        totalUsers: 1000 - i * 20,
        totalRuns: 100000 - i * 1000,
        users30Days: 400 - i * 10,
        users7Days: 120 - i * 3,
        users90Days: 800 - i * 15,
        runs30Days: 15000 - i * 200,
        reviewRating: 4.8,
        reviewCount: 20,
        categories: [i % 2 ? "ECOMMERCE" : "LEAD_GENERATION"],
        pricingInfos: [
          { pricingModel: "PRICE_PER_DATASET_ITEM", pricePerUnitUsd: 0.005, unitName: "result" },
        ],
        firstPublishedAt: new Date(Date.now() - (i + 10) * 86400000),
        detailsSyncedAt: new Date(),
        lastSeenAt: new Date(),
      },
      update: {},
    });
    for (const days of [7, 30, 90]) {
      const capturedAt = new Date(Date.now() - (days + 0.1) * 86400000);
      await db.storeActorSnapshot.create({
        data: {
          storeActorId: actor.id,
          capturedAt,
          totalUsers: 1000 - i * 20 - days * ((i % 5) + 1),
          totalRuns: 100000 - i * 1000 - days * 100,
          users30Days: 300 - i * 5,
          runs30Days: 10000,
        },
      });
    }
    if (i >= 3) continue;
    const own = await db.actor.upsert({
      where: {
        businessProfileId_apifyActorId: {
          businessProfileId: workspaceId,
          apifyActorId: `preview-public-${i}`,
        },
      },
      create: {
        userId,
        businessProfileId: workspaceId,
        apifyActorId: `preview-public-${i}`,
        actorName: actor.actorName,
        title: actor.title,
        description: actor.description,
        username: actor.username,
        lastRunSyncAt: new Date(),
        lastInsightSyncAt: new Date(),
      },
      update: {},
    });
    if (i < 2)
      for (let d = 0; d < 30; d++) {
        const day = new Date(new Date(Date.now() - d * 86400000).toISOString().slice(0, 10));
        await db.actorInsightSnapshot.upsert({
          where: { actorId_capturedOn: { actorId: own.id, capturedOn: day } },
          create: {
            actorId: own.id,
            capturedOn: day,
            periodStart: new Date(`${day.toISOString().slice(0, 7)}-01`),
            revenueUsd: i ? 12 : 24,
            costUsd: i ? 3 : 8,
            totalRuns: 40,
            succeededRuns: 38,
          },
          update: {},
        });
      }
    await db.actorExternalCost.upsert({
      where: { actorId_eventId: { actorId: own.id, eventId: "preview-proxy" } },
      create: {
        actorId: own.id,
        eventId: "preview-proxy",
        source: "Preview proxy expense",
        amountUsd: 2.5,
      },
      update: {},
    });
    await db.storeWatch.upsert({
      where: {
        businessProfileId_storeActorId: { businessProfileId: workspaceId, storeActorId: actor.id },
      },
      create: {
        businessProfileId: workspaceId,
        storeActorId: actor.id,
        baseline: {
          users30Days: actor.users30Days,
          runs30Days: actor.runs30Days,
          reviewRating: actor.reviewRating,
          pricing: actor.pricingInfos,
          isPublic: true,
          rank: i + 1,
        },
        checkedAt: new Date(),
      },
      update: {},
    });
  }
  process.stdout.write(
    "Local preview fixtures created for intelligence-preview@example.test. Data is illustrative and confined to the preview database.\n",
  );
  await db.$disconnect();
}
main().catch(async (error) => {
  process.stderr.write(`${String(error)}\n`);
  await db.$disconnect();
  process.exitCode = 1;
});
