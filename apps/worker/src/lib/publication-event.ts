import type { ApifyClientWrapper } from "@actorconsole/apify";
import type { db } from "@actorconsole/db";

/** Record the confirmed public transition; it may be a republication. */
export async function publishAndRecordActor(
  apify: Pick<ApifyClientWrapper, "publishActor">,
  database: Pick<typeof db, "actorPublicationEvent">,
  actor: { runId: string; apifyActorId: string; username: string; actorName: string },
  now: () => Date = () => new Date(),
) {
  const published = await apify.publishActor(actor.apifyActorId);
  if (!published.isPublic) throw new Error("Apify did not confirm that the Actor was published");
  await database.actorPublicationEvent.upsert({
    where: { runId_apifyActorId: { runId: actor.runId, apifyActorId: actor.apifyActorId } },
    create: {
      runId: actor.runId,
      apifyActorId: actor.apifyActorId,
      username: published.username || actor.username,
      actorName: published.name || actor.actorName,
      publishedAt: now(),
    },
    update: {},
  });
}
