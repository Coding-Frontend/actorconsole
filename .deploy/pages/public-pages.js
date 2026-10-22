import { PUBLIC_SITE, publicDocument } from "./public-document.js";
import { canonicalCatalogArgs } from "./public-catalog-query.js";

import { PUBLIC_API_ORIGIN as API_ORIGIN } from "./public-config.js";
const reservedBuilders = new Set(["compare"]);
const identifier = /^[a-zA-Z0-9_.-]{1,100}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** These are the only public page families that need request-time HTML. */
export function publicPageRoute(pathname) {
  let parts;
  try {
    parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  const [root, name, segment, actorName] = parts;
  if (root === "builders" && identifier.test(name ?? "") && !reservedBuilders.has(name)) {
    if (parts.length === 2)
      return { kind: "builder", username: name, path: `/builders/${encodeURIComponent(name)}` };
    if (parts.length === 4 && segment === "actors" && identifier.test(actorName ?? ""))
      return {
        kind: "actor",
        username: name,
        actorName,
        path: `/builders/${encodeURIComponent(name)}/actors/${encodeURIComponent(actorName)}`,
      };
  }
  if (
    ["blog", "changelog"].includes(root) &&
    parts.length === 2 &&
    name.length <= 200 &&
    slugPattern.test(name) &&
    !(root === "changelog" && name === "feed")
  )
    return { kind: root, slug: name, path: `/${root}/${name}` };
  return null;
}

export function publicApiPath(route) {
  if (route.kind === "builder")
    return `/public/catalog/profile?args=${encodeURIComponent(JSON.stringify(canonicalCatalogArgs("profile", [route.username, {}])))}`;
  if (route.kind === "actor")
    return `/public/catalog/actor?args=${encodeURIComponent(JSON.stringify([route.username, route.actorName, 30]))}`;
  if (route.kind === "blog") return `/blog/${encodeURIComponent(route.slug)}`;
  return `/changelog/entries/${encodeURIComponent(route.slug)}`;
}

// Filtered portfolio pages remain client rendered: no extra origin reads or
// unbounded cache keys for searches, sorts, windows, pagination and tracking.
export function needsClientFilters(url) {
  const defaults = {
    window: "30",
    actorPage: "1",
    actorQ: "",
    actorCategory: "",
    actorSort: "active-users",
    view: "grid",
  };
  return Object.entries(defaults).some(
    ([key, value]) => url.searchParams.has(key) && url.searchParams.get(key) !== value,
  );
}

export function publicPageMetadata(route, data) {
  if (route.kind === "builder")
    return {
      path: route.path,
      title: `${data.name ?? route.username} — Apify builder`,
      description: data.bio ?? `Explore ${route.username}'s public Apify Actor portfolio.`,
      image: data.pictureUrl,
    };
  if (route.kind === "actor")
    return {
      path: route.path,
      title: `${data.title} — Actor details`,
      description:
        data.description ?? `Public Apify Actor details for ${route.username}/${route.actorName}.`,
      image: data.effectivePictureUrl ?? data.pictureUrl,
    };
  const article = route.kind === "blog" ? data : data.entry;
  return {
    path: route.path,
    title: `${article.seoTitle ?? article.title} — ActorConsole ${route.kind === "blog" ? "Blog" : "Changelog"}`,
    description: article.seoDescription ?? article.excerpt ?? article.text?.slice(0, 200),
    image: article.coverImage,
    publishedAt:
      article.publishedAt ?? (article.releaseDate ? `${article.releaseDate}T00:00:00Z` : undefined),
    openGraph: { type: "article" },
  };
}

const securityHeaders = {
  "content-type": "text/html; charset=utf-8",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-actorconsole-edge": "public-page",
};

/** Cached anonymous HTML only. No cookies, authorization, database or secrets. */
export async function servePublicPage(
  request,
  {
    template,
    buildId,
    render,
    decode,
    cache,
    context,
    fetcher = fetch,
    reportError = (_error) => {},
  },
) {
  const url = new URL(request.url);
  const route = publicPageRoute(url.pathname);
  const errorPage = (status, title) =>
    new Response(
      publicDocument(
        template,
        { path: route?.path ?? url.pathname, title, noindex: true },
        {
          content: `<main class="mx-auto max-w-4xl px-6 py-20"><h1>${title}</h1><p><a href="/">Return to ActorConsole</a></p></main>`,
        },
      ),
      {
        status,
        headers: { ...securityHeaders, "cache-control": "no-store", "x-robots-tag": "noindex" },
      },
    );
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, {
      status: 405,
      headers: { ...securityHeaders, allow: "GET, HEAD", "cache-control": "no-store" },
    });
  if (!route)
    return request.method === "HEAD"
      ? new Response(null, errorPage(404, "Page not found"))
      : errorPage(404, "Page not found");
  if (["builder", "actor"].includes(route.kind) && needsClientFilters(url)) {
    const response = new Response(
      publicDocument(template, { path: route.path, title: "ActorConsole — Apify operations" }),
      { headers: { ...securityHeaders, "cache-control": "no-store" } },
    );
    return request.method === "HEAD" ? new Response(null, response) : response;
  }
  const cacheKey = new Request(
    `${PUBLIC_SITE}${route.path}?ac-build=${encodeURIComponent(buildId)}`,
  );
  try {
    const hit = await cache?.match(cacheKey);
    if (hit) return request.method === "HEAD" ? new Response(null, hit) : hit;
  } catch {
    /* Cache availability must not block public reads. */
  }
  try {
    const apiPath = publicApiPath(route);
    const upstream = await fetcher(`${API_ORIGIN}${apiPath}`, {
      headers: { accept: "application/json" },
      credentials: "omit",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    if (upstream.status === 404)
      return request.method === "HEAD"
        ? new Response(null, errorPage(404, "Page not found"))
        : errorPage(404, "Page not found");
    if (!upstream.ok || !upstream.headers.get("content-type")?.includes("application/json"))
      throw new Error("Public API unavailable");
    const payload = await upstream.json();
    if (payload.ok !== true || !Object.hasOwn(payload, "data"))
      throw new Error("Invalid public API response");
    const data = decode(payload.data);
    if (!data)
      return request.method === "HEAD"
        ? new Response(null, errorPage(404, "Page not found"))
        : errorPage(404, "Page not found");
    const canonical = `${PUBLIC_SITE}${route.path}`;
    const content = await render(route, data, canonical);
    const html = publicDocument(template, publicPageMetadata(route, data), {
      content,
      seed: { path: route.path, apiPath, payload, expires: Date.now() + 60_000 },
    });
    const response = new Response(html, {
      headers: { ...securityHeaders, "cache-control": "public, max-age=0, s-maxage=60" },
    });
    if (cache && context) context.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
    return request.method === "HEAD" ? new Response(null, response) : response;
  } catch (error) {
    reportError(error);
    const response = errorPage(503, "This page is temporarily unavailable");
    response.headers.set("retry-after", "30");
    return request.method === "HEAD" ? new Response(null, response) : response;
  }
}
