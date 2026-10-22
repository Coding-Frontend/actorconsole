import { NextResponse } from "next/server";
import { SERVER_API_BASE_URL } from "@/lib/api-base";
import { revalidateTag } from "next/cache";
import { isPublicCachePath, PUBLIC_CACHE_SECONDS, PUBLIC_CATALOG_TAG } from "./public-cache-policy";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/**
 * Forward a same-origin Next.js API request to the always-on Hono API.
 *
 * This is used for the public /api/* surface. Forwarding the complete
 * non-hop-by-hop header set is important for signed provider webhooks as well
 * as backend session cookies.
 */
export async function proxyApiRequest(request: Request, path: string[]) {
  if (
    path.length === 0 ||
    path.some((segment) => !segment || segment === "." || segment === ".." || segment.length > 191)
  ) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_path", message: "Invalid API path" } },
      { status: 400 },
    );
  }

  const target = new URL(
    path.map((segment) => encodeURIComponent(segment)).join("/"),
    `${SERVER_API_BASE_URL}/`,
  );
  target.search = new URL(request.url).search;
  const isImmutableWebsiteLogo = path.length === 2 && path[0] === "website-logo-assets";
  const publicRead = request.method === "GET" && isPublicCachePath(path);

  const upstreamHeaders = new Headers();
  for (const [name, value] of request.headers) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) upstreamHeaders.set(name, value);
  }
  if (publicRead) {
    // Public CDN entries must never depend on a caller's workspace or identity.
    for (const name of [...upstreamHeaders.keys()]) upstreamHeaders.delete(name);
    upstreamHeaders.set("accept", "application/json");
  }

  try {
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const upstream = await fetch(target, {
      method: request.method,
      headers: upstreamHeaders,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
    });

    const publicCacheable = publicRead && upstream.ok &&
      upstream.headers.getSetCookie().length === 0 &&
      /^public(?:\s*,|$)/i.test(upstream.headers.get("cache-control") ?? "");
    const immutableCacheable = isImmutableWebsiteLogo && upstream.ok &&
      ["GET", "HEAD"].includes(request.method) && upstream.headers.getSetCookie().length === 0;
    const responseHeaders = new Headers({
      "cache-control": immutableCacheable
        ? (upstream.headers.get("cache-control") ?? "public, max-age=31536000, immutable")
        : publicCacheable
          ? `public, max-age=${PUBLIC_CACHE_SECONDS}, s-maxage=${PUBLIC_CACHE_SECONDS}, stale-while-revalidate=300`
        : "no-store",
    });
    for (const name of [
      "access-control-allow-credentials",
      "access-control-allow-headers",
      "access-control-allow-methods",
      "access-control-allow-origin",
      "access-control-max-age",
      "content-type",
      "content-disposition",
      ...(isImmutableWebsiteLogo ? ["etag", "last-modified"] : []),
      "location",
      "retry-after",
    ]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);

    if (upstream.ok && path[0] === "admin" && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      try { revalidateTag(PUBLIC_CATALOG_TAG); }
      catch { /* Keep the accepted mutation successful; TTL revalidation remains active. */ }
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "upstream_unavailable", message: "The API is unavailable" },
      },
      { status: 502 },
    );
  }
}
