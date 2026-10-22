import { actorInventoryAudience } from "@actorconsole/shared";
import type { ApifyActorSummary, ApifyActorDetail } from "./types";

type AudienceClient = {
  listMyActors(options: { limit: number; offset: number }): Promise<ApifyActorSummary[]>;
  getActor(id: string): Promise<ApifyActorDetail | null>;
};

/** Compact owned-actor lists can omit stats. Fetch details only for missing
 * 30-day counts; this runs in the worker rather than delaying dashboard requests. */
export async function collectWorkspaceAudience(apify: AudienceClient) {
  const inventory = new Map<string, ApifyActorSummary>();
  for (let offset = 0; ; offset += 1_000) {
    const page = await apify.listMyActors({ limit: 1_000, offset });
    for (const actor of page) inventory.set(actor.id, actor);
    if (page.length < 1_000) break;
  }
  const actors = [...inventory.values()].map((actor) => ({ ...actor }));
  const missing = actors.filter((actor) => !actorInventoryAudience([actor]).monthlyUsersComplete);
  for (let offset = 0; offset < missing.length; offset += 5) {
    await Promise.all(
      missing.slice(offset, offset + 5).map(async (actor) => {
        const detail = await apify.getActor(actor.id);
        // A deleted/moved actor needs a new inventory read, not a fabricated zero.
        if (!detail) throw new Error("Actor inventory changed during audience synchronization");
        actor.stats = detail.stats;
      }),
    );
  }
  return { actorCount: actors.length, ...actorInventoryAudience(actors) };
}
