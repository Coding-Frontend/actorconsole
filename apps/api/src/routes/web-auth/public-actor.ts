import { getPublicActor } from "@actorconsole/apify";
import { JsonResponse } from "../../lib/http-context.js";


type RouteContext = { params: Promise<{ username: string; actorName: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { username, actorName } = await context.params;
  try {
    const actor = await getPublicActor(`${username}/${actorName}`);
    return JsonResponse.json(
      { ok: true, data: actor },
      { headers: { "cache-control": "private, max-age=300" } },
    );
  } catch {
    return JsonResponse.json(
      {
        ok: false,
        error: { code: "public_actor_unavailable", message: "Could not load public actor data" },
      },
      { status: 502 },
    );
  }
}
