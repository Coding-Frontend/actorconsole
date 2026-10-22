import { JsonResponse } from "../../lib/http-context.js";
import { db } from "@actorconsole/db";
import { getPublicActorDocumentation } from "../../lib/public-actor-content.js";


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string; actorName: string }> },
) {
  const { username, actorName } = await params;
  const actor = await db.storeActor.findFirst({
    where: { username, actorName, isPublic: true },
    select: { apifyActorId: true },
  });
  if (!actor) return JsonResponse.json({ error: "Actor not found" }, { status: 404 });

  try {
    const data = await getPublicActorDocumentation(username, actorName, actor.apifyActorId);
    return JsonResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return JsonResponse.json(
      { error: error instanceof Error ? error.message : "Actor documentation could not be loaded" },
      { status: 502 },
    );
  }
}
