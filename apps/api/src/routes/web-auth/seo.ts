import { JsonResponse } from "../../lib/http-context.js";
import { getPublicActor } from "@actorconsole/apify";
import { auditActorSeo } from "@actorconsole/shared";
import { getPublicActorReadme } from "../../lib/public-actor-content.js";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("actor")?.trim() ?? "";
  let name = raw;
  if (raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      if (url.hostname !== "apify.com") throw new Error();
      name = url.pathname.replace(/^\/|\/$/g, "");
    } catch {
      return JsonResponse.json(
        { error: "Use an apify.com Actor URL or username/actor-name." },
        { status: 400 },
      );
    }
  }
  if (!/^[a-zA-Z0-9_-]{1,100}\/[a-zA-Z0-9_-]{1,100}$/.test(name))
    return JsonResponse.json(
      { error: "Enter username/actor-name or a public Apify Actor URL." },
      { status: 400 },
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const actor = await Promise.race([
      getPublicActor(name),
      new Promise<null>((resolve) => {
        // Leave budget for the optional Markdown fallback and browser response
        // within the SEO tool's 15-second deadline.
        timer = setTimeout(() => resolve(null), 10_000);
      }),
    ]);
    if (!actor || !actor.isPublic)
      return JsonResponse.json(
        { error: "This public Actor could not be loaded. Check its name and try again." },
        { status: 404 },
      );
    const [username, actorName] = name.split("/");
    const readme = actor.readme ?? await getPublicActorReadme(username, actorName);
    const audit = auditActorSeo({
      title: actor.title ?? actor.name,
      description: actor.description ?? "",
      seoTitle: actor.seoTitle ?? undefined,
      seoDescription: actor.seoDescription ?? undefined,
      readme: readme ?? undefined,
    });
    return JsonResponse.json(
      {
        data: {
          ...audit,
          name,
          sourceUrl: `https://apify.com/${name}`,
          auditedAt: new Date().toISOString(),
        },
      },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch {
    return JsonResponse.json(
      { error: "Apify could not be reached. Try again shortly." },
      { status: 502 },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
