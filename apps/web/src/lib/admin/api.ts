import { SERVER_API_BASE_URL } from "@/lib/api-base";
/** Browser calls use the same-origin proxy; server callers supply their session cookie. */
export async function api<T = unknown>(
  path: string,
  init: RequestInit & { params?: Record<string, string | number | undefined> } = {},
): Promise<
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      error: { code: string; message: string; details?: unknown };
    }
> {
  const isBrowser = typeof window !== "undefined";
  const base = isBrowser ? window.location.origin : SERVER_API_BASE_URL;

  const requestPath = isBrowser
    ? `/api${path.startsWith("/") ? path : `/${path}`}`
    : path.replace(/^\/+/, "");
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const url = new URL(requestPath, normalizedBase);
  if (init.params) {
    for (const [k, v] of Object.entries(init.params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; data?: T; error?: { code?: string; message?: string; details?: unknown } }
    | null;

  if (res.ok && body?.ok === true) {
    return { ok: true, data: body.data as T };
  }

  return {
    ok: false,
    status: res.status,
    error: {
      code: body?.error?.code ?? (res.ok ? "invalid_response" : `http_${res.status}`),
      message:
        body?.error?.message ??
        (res.ok
          ? "The admin API returned an invalid response"
          : `The admin API request failed with HTTP ${res.status}`),
      ...(body?.error?.details === undefined ? {} : { details: body.error.details }),
    },
  };
}
