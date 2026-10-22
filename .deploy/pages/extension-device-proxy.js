import { PUBLIC_API_ORIGIN as API_ORIGIN, PUBLIC_SITE } from "./public-config.js";
const PREFIX = "/api/extension-device";
const WEB_ORIGINS = new Set([PUBLIC_SITE]);

function methodsFor(path) {
  if (path === "/me") return ["GET", "DELETE"];
  if (path === "/workspaces") return ["GET", "POST"];
  if (["/claim", "/poll", "/authorize-handoff"].includes(path)) return ["POST"];
  if (/^\/workspaces\/[A-Za-z0-9_-]{1,191}\/apify\/check$/.test(path)) return ["POST"];
  if (/^\/workspaces\/[A-Za-z0-9_-]{1,191}\/apify\/api-key$/.test(path)) return ["POST"];
  if (/^\/workspaces\/[A-Za-z0-9_-]{1,191}\/apify$/.test(path)) return ["DELETE"];
  return [];
}

/** Compatibility only: Node.js retains device authentication and all business logic. */
export async function proxyExtensionDevice(request) {
  const url = new URL(request.url);
  const path = url.pathname.slice(PREFIX.length).replace(/\/$/, "");
  const methods = methodsFor(path);
  const origin = request.headers.get("origin");
  const allowedOrigin =
    origin && (WEB_ORIGINS.has(origin) || /^chrome-extension:\/\/[a-p]{32}$/.test(origin));
  const responseHeaders = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-actorconsole-edge": "extension-device",
    vary: "Origin",
  });
  if (allowedOrigin) {
    responseHeaders.set("access-control-allow-origin", origin);
    responseHeaders.set("access-control-expose-headers", "X-Request-Id, Retry-After");
  }
  const error = (status, code, message) =>
    Response.json({ ok: false, error: { code, message } }, { status, headers: responseHeaders });
  if (!url.pathname.startsWith(`${PREFIX}/`) || !methods.length)
    return error(404, "not_found", "This extension endpoint is not available.");
  if (origin && !allowedOrigin) return error(403, "origin_denied", "This origin is not allowed.");
  if (request.method === "OPTIONS") {
    responseHeaders.set("access-control-allow-methods", methods.join(", "));
    responseHeaders.set("access-control-allow-headers", "Authorization, Content-Type");
    return new Response(null, { status: 204, headers: responseHeaders });
  }
  if (!methods.includes(request.method)) {
    responseHeaders.set("allow", methods.join(", "));
    return error(405, "method_not_allowed", "This method is not allowed.");
  }
  const authorization = request.headers.get("authorization");
  if (
    !["/claim", "/poll"].includes(path) &&
    !/^Bearer acx_[a-f0-9]{64}$/i.test(authorization ?? "")
  )
    return error(401, "extension_not_paired", "Pair the extension with ActorConsole first.");
  let body;
  if (!["GET", "HEAD"].includes(request.method)) {
    if (Number(request.headers.get("content-length")) > 65_536)
      return error(413, "body_too_large", "The extension request is too large.");
    const reader = request.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65_536) {
          await reader.cancel();
          return error(413, "body_too_large", "The extension request is too large.");
        }
        chunks.push(value);
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }
  }
  const headers = new Headers({ accept: "application/json" });
  for (const name of ["authorization", "content-type", "origin"])
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  // Never forward website cookies, user-selected upstreams or spoofed proxy headers.
  try {
    const upstream = await fetch(`${API_ORIGIN}/extension-device${path}${url.search}`, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(25_000),
    });
    if (!upstream.headers.get("content-type")?.includes("application/json")) {
      await upstream.body?.cancel();
      return error(
        502,
        "extension_api_unavailable",
        "The extension service is unavailable. Try again.",
      );
    }
    for (const name of ["x-request-id", "retry-after"])
      if (upstream.headers.has(name)) responseHeaders.set(name, upstream.headers.get(name));
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return error(
      502,
      "extension_api_unavailable",
      "The extension service is unavailable. Try again.",
    );
  }
}

export default {
  fetch(request, env) {
    return new URL(request.url).pathname.startsWith(`${PREFIX}/`)
      ? proxyExtensionDevice(request)
      : env.ASSETS.fetch(request);
  },
};
