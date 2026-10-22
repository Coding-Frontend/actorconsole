import "server-only";
import { cookies } from "next/headers";
import { api as request } from "./api";
/** Server rendering uses the caller's identity instead of a privileged service credential. */
export async function api<T = unknown>(path: string, init: RequestInit & { params?: Record<string, string | number | undefined> } = {}) {
  const store = await cookies();
  const headers = new Headers(init.headers);
  headers.set("cookie", store.toString());
  return request<T>(path, { ...init, headers: Object.fromEntries(headers) });
}
