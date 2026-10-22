import { AsyncLocalStorage } from "node:async_hooks";
import { parse, serialize, type CookieOptions } from "hono/utils/cookie";

const requests = new AsyncLocalStorage<{ request: Request; pendingCookies: string[] }>();

export function currentRequest(): Request {
  const state = requests.getStore();
  if (!state) throw new Error("No API request context");
  return state.request;
}

export async function requestCookies() {
  const state = requests.getStore();
  if (!state) throw new Error("No API request context");
  const values = parse(state.request.headers.get("cookie") ?? "");
  return {
    get(name: string) {
      const value = values[name];
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string, options: CookieOptions = {}) {
      state.pendingCookies.push(serialize(name, value, options));
    },
    delete(name: string) {
      state.pendingCookies.push(serialize(name, "", {
        path: "/", maxAge: 0, httpOnly: true, sameSite: "Lax", secure: name.startsWith("__Secure-"),
      }));
    },
  };
}

/** Standard HTTP response with explicit cookie headers for backend auth handlers. */
export class JsonResponse extends Response {
  static json(body: unknown, init: ResponseInit = {}): JsonResponse {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    return new JsonResponse(JSON.stringify(body), { ...init, headers });
  }

  cookies = {
    set: (name: string, value: string, options: CookieOptions = {}) => {
      this.headers.append("set-cookie", serialize(name, value, options));
    },
  };
}

export async function withRequestContext(request: Request, handler: () => Promise<Response>) {
  return requests.run({ request, pendingCookies: [] }, async () => {
    const response = await handler();
    for (const cookie of requests.getStore()!.pendingCookies) response.headers.append("set-cookie", cookie);
    return response;
  });
}
