import next from "./.open-next/worker.js";
// Load the Next server at startup so each isolate's first request can focus on rendering.
import "./.open-next/server-functions/default/handler.mjs";

const ASSET_PATHS = new Set(JSON.parse(process.env.ACTORCONSOLE_PAGES_ASSETS ?? "[]"));
const PRERENDERED = new Set(JSON.parse(process.env.ACTORCONSOLE_PAGES_PRERENDERED ?? "[]"));
const PRODUCTION_HOST = "actorconsole.com";
const PRERENDERED_PREFIX = "/_actorconsole-pages/";
const ANONYMOUS_CACHE_PATHS = new Set(["/", "/builders", "/faq", "/pricing", "/research"]);
const CATALOG_DOCUMENT_PATH =
  /^\/builders\/(?!compare(?:\/|$))[\w.-]+(?:\/actors\/[\w.-]+)?$/;
const DOCUMENT_VARY =
  "Accept, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url";
const SECURITY_HEADERS = {
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

const PRIVATE_PAGES = [
  "/admin",
  "/dashboard",
  "/extension",
  "/forgot-password",
  "/login",
  "/mimic-ended",
  "/newsletter/unsubscribe",
  "/signup",
];

function isUnder(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPublicApi(pathname) {
  return (
    pathname === "/api/health" ||
    pathname === "/api/payment-gateways" ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/actors/public/") ||
    /^\/api\/website-logo-assets\/[A-Za-z0-9_-]+$/.test(pathname)
  );
}

function previewResponse(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: { ...headers, "x-robots-tag": "noindex, nofollow" },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname === `www.${PRODUCTION_HOST}`) {
      return Response.redirect(`https://${PRODUCTION_HOST}${url.pathname}${url.search}`, 308);
    }

    if (url.pathname.startsWith(PRERENDERED_PREFIX)) {
      return previewResponse("Page not found.", 404);
    }

    if (url.hostname === PRODUCTION_HOST) {
      if (url.pathname === "/_pages/revision") return serveRevision(env);
      if (ASSET_PATHS.has(decodePath(url.pathname))) return env.ASSETS.fetch(request);
      if (
        url.pathname === "/api/auth/session" &&
        !url.search &&
        request.method === "GET" &&
        !request.headers.has("origin") &&
        !/(?:^|;\s*)(?:__Secure-)?authjs\.session-token(?:\.\d+)?\s*=/i.test(
          request.headers.get("cookie") ?? "",
        )
      ) {
        return previewResponse("null", 200, {
          ...SECURITY_HEADERS,
          "cache-control": "private, no-store",
          "content-type": "application/json",
        });
      }
      const prerendered = await servePrerendered(request, env, url);
      if (prerendered) return prerendered;
      if (
        env.PUBLIC_CATALOG_RENDER_ORIGIN === "https://api.actorconsole.com" &&
        CATALOG_DOCUMENT_PATH.test(url.pathname) &&
        ["GET", "HEAD"].includes(request.method)
      ) {
        if (request.headers.get("rsc") === "1") {
          // Next falls back to a document navigation when a route uses a
          // different renderer and its response is HTML instead of Flight.
          return new Response(null, {
            headers: { "content-type": "text/html", "cache-control": "private, no-store" },
          });
        }
        if (isAnonymousDocument(request, url)) return serveCatalogDocument(request, env, ctx);
        return fetchCatalogDocument(request, env);
      }
      if (CATALOG_DOCUMENT_PATH.test(url.pathname) && isAnonymousDocument(request, url)) {
        return serveCatalogDocument(request, env, ctx);
      }
      if (ANONYMOUS_CACHE_PATHS.has(url.pathname) && isAnonymousDocument(request, url)) {
        return serveCachedDocument(request, env, ctx, url);
      }
      return next.fetch(request, env, ctx);
    }

    if (!["GET", "HEAD"].includes(request.method)) {
      return previewResponse("This preview accepts public reads only.", 405, {
        allow: "GET, HEAD",
      });
    }

    const pathname = decodePath(url.pathname);
    if (
      pathname === null ||
      /[%\\]/.test(pathname) ||
      pathname.includes("//") ||
      pathname.split("/").some((segment) => segment === "." || segment === "..")
    ) {
      return previewResponse("Invalid path.", 400);
    }
    if (
      PRIVATE_PAGES.some((prefix) => isUnder(pathname, prefix)) ||
      (isUnder(pathname, "/api") && !isPublicApi(pathname))
    ) {
      return previewResponse("This route is unavailable in preview.", 404);
    }
    if (pathname === "/robots.txt") {
      return previewResponse("User-agent: *\nDisallow: /\n", 200, {
        "content-type": "text/plain; charset=utf-8",
      });
    }
    if (pathname === "/_pages/revision") {
      return serveRevision(env);
    }

    const headers = new Headers(request.headers);
    for (const name of [
      "authorization",
      "cookie",
      "proxy-authorization",
      "x-admin-api-key",
      "x-api-key",
      "x-session-token",
    ]) {
      headers.delete(name);
    }
    const publicRequest = new Request(request, { headers });
    const isAsset = ASSET_PATHS.has(pathname);
    const response = isAsset
      ? await env.ASSETS.fetch(publicRequest)
      : ((await servePrerendered(publicRequest, env, url)) ??
        (await next.fetch(publicRequest, env, ctx)));
    const result = new Response(response.body, response);
    result.headers.delete("set-cookie");
    result.headers.set("x-robots-tag", "noindex, nofollow");
    if (!isAsset) result.headers.set("cache-control", "private, no-store");
    return result;
  },
};

function requiresNext(request) {
  return [
    "next-action",
    "next-router-segment-prefetch",
    "x-nextjs-data",
    "if-match",
    "if-none-match",
    "if-modified-since",
    "if-unmodified-since",
    "range",
  ].some((name) => request.headers.has(name));
}

function isAnonymousDocument(request, url) {
  return (
    request.method === "GET" &&
    !url.search &&
    /\btext\/html\b/i.test(request.headers.get("accept") ?? "") &&
    !requiresNext(request) &&
    ![
      "rsc",
      "next-router-state-tree",
      "next-router-prefetch",
      "next-url",
      "cookie",
      "authorization",
      "proxy-authorization",
      "x-admin-api-key",
      "x-api-key",
      "x-session-token",
      "origin",
    ].some((name) => request.headers.has(name))
  );
}

function isPublicHtml(response) {
  return (
    response.status === 200 &&
    /^text\/html\b/i.test(response.headers.get("content-type") ?? "") &&
    !response.headers.has("set-cookie")
  );
}

async function serveCatalogDocument(request, env, ctx) {
  const requestHeaders = new Headers(request.headers);
  // Select Next's blocking HTML render so every cached document includes its
  // metadata in the head, including when a regular browser fills the cache.
  requestHeaders.set("user-agent", "ActorConsole-Pages (compatible; Google-PageRenderer)");
  const response = env.PUBLIC_CATALOG_RENDER_ORIGIN === "https://api.actorconsole.com"
    ? await fetchCatalogDocument(request, env)
    : await next.fetch(new Request(request, { headers: requestHeaders }), env, ctx);
  if (!isPublicHtml(response) || !response.body) return response;

  // Next can stream a 200 for a missing detail page. Only opt in after its
  // generated head declares the document indexable.
  const reader = response.body.getReader();
  const chunks = [];
  const decoder = new TextDecoder();
  const headLimit = 64 * 1024;
  let head = "";
  let remaining = headLimit;
  let headEnd = -1;
  while (remaining > 0 && headEnd === -1) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    head += decoder.decode(value.subarray(0, remaining), { stream: true });
    remaining -= value.byteLength;
    headEnd = head.indexOf("</head>");
  }

  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  // The zone Cache Rule makes these documents eligible before Pages runs.
  if (
    headEnd >= 0 &&
    /<meta name="robots" content="index, follow"\s*\/?>/i.test(head.slice(0, headEnd))
  ) {
    headers.set("cloudflare-cdn-cache-control", "public, max-age=300");
  }
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Response(body, { status: response.status, headers });
}

async function fetchCatalogDocument(request, env) {
  const incoming = new URL(request.url);
  const target = new URL(
    "/__catalog_render" + incoming.pathname + incoming.search,
    env.PUBLIC_CATALOG_RENDER_ORIGIN,
  );
  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      accept: "text/html",
      "user-agent": "ActorConsole-Pages (compatible; Google-PageRenderer)",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const headers = new Headers(upstream.headers);
  headers.delete("set-cookie");
  headers.delete("cloudflare-cdn-cache-control");
  headers.delete("cdn-cache-control");
  headers.set("cache-control", "private, no-store");
  headers.set("x-actorconsole-render", "origin");
  return new Response(upstream.body, { status: upstream.status, headers });
}

async function servePrerendered(request, env, url) {
  if (
    !PRERENDERED.has(url.pathname) ||
    !["GET", "HEAD"].includes(request.method) ||
    requiresNext(request)
  )
    return null;

  const rsc = request.headers.get("rsc") === "1";
  const suffix = rsc ? ".flight" : ".body";
  const asset = new URL(`${PRERENDERED_PREFIX}${url.pathname.slice(1)}${suffix}`, url);
  const response = await env.ASSETS.fetch(new Request(asset, { method: request.method }));
  if (!response.ok) {
    await response.body?.cancel();
    return null;
  }
  return new Response(response.body, {
    headers: {
      ...SECURITY_HEADERS,
      "cache-control": "private, no-store",
      "content-type": rsc ? "text/x-component" : "text/html; charset=utf-8",
      vary: DOCUMENT_VARY,
      "x-actorconsole-render": "prerendered",
    },
  });
}

async function serveCachedDocument(request, env, ctx, url) {
  const key = new URL(url);
  key.searchParams.set("pages-build", process.env.ACTORCONSOLE_PAGES_REVISION ?? "local");
  const cache = caches.default;
  const cached = await cache.match(key.href).catch(() => undefined);
  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set("cache-control", "private, no-store");
    response.headers.set("x-actorconsole-render", "cached");
    return response;
  }
  const response = await next.fetch(request, env, ctx);
  if (isPublicHtml(response)) {
    const copy = response.clone();
    const cacheable = new Response(copy.body, copy);
    cacheable.headers.set("cache-control", "public, max-age=60");
    ctx.waitUntil(cache.put(key.href, cacheable).catch(() => undefined));
  }
  return response;
}

function decodePath(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function serveRevision(env) {
  return previewResponse(
    process.env.ACTORCONSOLE_PAGES_REVISION ?? env.CF_PAGES_COMMIT_SHA ?? "local",
    200,
    {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  );
}
