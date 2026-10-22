import { db } from "@actorconsole/db";
import { publicCache as unstable_cache } from "./public-cache.js";
import {
  estimateActorEarnings,
  rollupEarnings,
  type ActorEarnings,
} from "@actorconsole/shared/actor-earnings";

/** Bounded batches avoid loading the entire catalog's pricing JSON at once. */
export const getBuilderEarnings = unstable_cache(
  async () => {
    const groups = new Map<string, ActorEarnings[]>();
    let cursor: string | undefined;
    let actors = 0,
      users30Days = 0,
      totalUsers = 0,
      reportedUserActors = 0;
    while (true) {
      const rows = await db.storeActor.findMany({
        where: {
          isPublic: true,
          isDeprecated: false,
          apifyActorId: { not: { contains: "/" } },
          username: { not: "apify" },
        },
        orderBy: { id: "asc" },
        take: 1000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          username: true,
          pricingInfos: true,
          runs30Days: true,
          users30Days: true,
          totalUsers: true,
        },
      });
      for (const row of rows) {
        actors++;
        users30Days += row.users30Days ?? 0;
        totalUsers += row.totalUsers ?? 0;
        if (row.users30Days != null) reportedUserActors++;
        const values = groups.get(row.username) ?? [];
        values.push(estimateActorEarnings(row));
        groups.set(row.username, values);
      }
      if (rows.length < 1000) break;
      cursor = rows.at(-1)!.id;
    }
    return {
      builders: Object.fromEntries(
        [...groups].map(([username, values]) => [username, rollupEarnings(values)]),
      ),
      catalog: {
        totalBuilders: groups.size,
        catalogActorCount: actors,
        users30Days,
        totalUsers,
        reportedUserActors,
        earnings: rollupEarnings([...groups.values()].flat()),
      },
    };
  },
  ["builder-earnings-public-v3"],
  { revalidate: 300 },
);
