import { API_BASE_URL } from "./api-base";
import {
  loadPublicComparison,
  parseComparisonIds,
  parseComparisonWindow,
  searchPublicComparison,
} from "../lib/public-comparison";

export function normalizeApiUrl(value: string) {
  const url = new URL(value, window.location.origin);
  if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
    const path = url.pathname.replace(/^\/api(?:\/backend)?(?=\/)/, "");
    return `${API_BASE_URL}${path}${url.search}${url.hash}`;
  }
  return value;
}

/** Compatibility for existing feature components; every real request goes directly to the Node.js API. */
export function isReadOnlyPreview() {
  return new URLSearchParams(window.location.search).get("qa") === "read-only";
}

export function installApiRequests({ readOnly = isReadOnlyPreview() } = {}) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    const original = new URL(raw, window.location.origin);
    if (
      original.origin === window.location.origin &&
      ["/api/public/comparison", "/api/public/comparison/search"].includes(original.pathname)
    ) {
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (method.toUpperCase() !== "GET")
        return Response.json(
          { error: "Method not allowed" },
          { status: 405, headers: { Allow: "GET" } },
        );
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      signal?.throwIfAborted();
      const params = original.searchParams;
      const kind = params.get("kind") === "actor" ? "actor" : "builder";
      const period = parseComparisonWindow(params.get("window"));
      try {
        if (original.pathname.endsWith("/search")) {
          const query = params.get("q")?.trim().slice(0, 80) ?? "";
          const items = query.length < 2 ? [] : await searchPublicComparison(kind, query, period);
          signal?.throwIfAborted();
          return Response.json({ items });
        }
        const ids = parseComparisonIds(params.getAll("item"));
        const data = ids.length
          ? await loadPublicComparison(kind, ids, period)
          : { items: [], missing: 0 };
        signal?.throwIfAborted();
        return Response.json(data);
      } catch {
        signal?.throwIfAborted();
        return Response.json(
          { error: "Comparison data is unavailable. Try again." },
          { status: 503 },
        );
      }
    }
    const normalized = normalizeApiUrl(raw);
    const target = new URL(normalized, window.location.origin);
    const apiRequest = target.origin === new URL(API_BASE_URL).origin;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const loginPaths = ["/auth/local/login", "/auth/firebase-session", "/auth/signout"];
    if (
      apiRequest &&
      readOnly &&
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      !loginPaths.includes(target.pathname)
    ) {
      return Response.json(
        { ok: false, error: "This preview is read-only. Account and Actor changes are disabled." },
        { status: 403 },
      );
    }
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.delete("cookie");
    const credentials =
      init?.credentials ?? (input instanceof Request ? input.credentials : undefined);
    const options = apiRequest
      ? {
          ...init,
          headers,
          credentials: credentials === "omit" ? ("omit" as const) : ("include" as const),
        }
      : init;
    if (input instanceof Request) return nativeFetch(new Request(normalized, input), options);
    return nativeFetch(normalized, options);
  };
  return () => {
    window.fetch = nativeFetch;
  };
}
