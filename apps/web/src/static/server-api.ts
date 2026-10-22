import { API_BASE_URL } from "./api-base";
import { fetchRead } from "../lib/read-request";
export async function authenticatedServerFetch(path: string, init: RequestInit = {}) {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid API path");
  const headers = new Headers(init.headers);
  headers.delete("cookie");
  const timeout =
    /^\/actors\/(usage|costs|revenue|usage-costs)(\?|$)/.test(path) ||
    /^\/account\/default-dashboard(\?|$)/.test(path)
      ? 30_000
      : 12_000;
  return fetchRead(
    `${API_BASE_URL}${path}`,
    {
      ...init,
      headers,
      credentials: "include",
      cache: "no-store",
    },
    timeout,
  );
}
