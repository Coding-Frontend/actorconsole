/** Supplemental synthetic earnings cases; restricted to the disposable preview database. */
import { db } from "../packages/db/src/client";

async function main() {
  if (
    !/^mysql:\/\/[^/]+@127\.0\.0\.1:3308\/actorconsole_intelligence_preview$/.test(
      process.env.DATABASE_URL ?? "",
    )
  )
    throw new Error("Use the isolated loopback intelligence preview database.");
  const cases = [
    {
      name: "start",
      pricing: [
        {
          pricingModel: "PAY_PER_EVENT",
          pricingPerEvent: {
            actorChargeEvents: {
              "apify-actor-start": {
                eventPriceUsd: 0.5,
                isPrimaryEvent: true,
                isOneTimeEvent: true,
              },
            },
          },
        },
      ],
    },
    { name: "free", pricing: [{ pricingModel: "FREE" }] },
    { name: "unknown", pricing: [] },
  ];
  for (const item of cases) {
    const data = {
      username: `preview-${item.name}`,
      actorName: `${item.name}-fixture`,
      title: `Synthetic ${item.name} earnings fixture`,
      description: "Local preview fixture for earnings verification.",
      isPublic: true,
      isDeprecated: false,
      users30Days: 100,
      users7Days: 25,
      totalUsers: 200,
      runs30Days: 100000,
      totalRuns: 300000,
      pricingInfos: item.pricing,
      lastSeenAt: new Date(),
      firstSeenAt: new Date(),
    };
    await db.storeActor.upsert({
      where: { apifyActorId: `preview-earnings-${item.name}` },
      create: { apifyActorId: `preview-earnings-${item.name}`, ...data },
      update: data,
    });
  }
  console.log("Synthetic earnings preview cases prepared.");
}
main().finally(() => db.$disconnect());
