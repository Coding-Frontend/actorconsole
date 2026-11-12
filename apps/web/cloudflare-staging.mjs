import next from "./.open-next/worker.js";

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

function stagingResponse(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: { ...headers, "x-robots-tag": "noindex, nofollow" },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (!["GET", "HEAD"].includes(request.method)) {
      return stagingResponse("Staging accepts public reads only.", 405, { allow: "GET, HEAD" });
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return stagingResponse("Invalid path.", 400);
    }
    if (
      /[%\\]/.test(pathname) ||
      pathname.includes("//") ||
      pathname.split("/").some((segment) => segment === "." || segment === "..")
    ) {
      return stagingResponse("Invalid path.", 400);
    }
    if (
      PRIVATE_PAGES.some((prefix) => isUnder(pathname, prefix)) ||
      (isUnder(pathname, "/api") && !isPublicApi(pathname))
    ) {
      return stagingResponse("This route is unavailable in staging.", 404);
    }
    if (pathname === "/robots.txt") {
      return stagingResponse("User-agent: *\nDisallow: /\n", 200, {
        "content-type": "text/plain; charset=utf-8",
      });
    }
    if (pathname === "/_staging/revision") {
      return stagingResponse(env.ACTORCONSOLE_REVISION ?? "local", 200, {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      });
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
    const asset = await env.ASSETS.fetch(publicRequest);
    if (asset.status === 404) await asset.body?.cancel();
    const response = asset.status === 404 ? await next.fetch(publicRequest, env, ctx) : asset;
    const result = new Response(response.body, response);
    result.headers.delete("set-cookie");
    result.headers.set("x-robots-tag", "noindex, nofollow");
    return result;
  },
};
