import type { WebSession } from "@actorconsole/shared/web-session";
import { API_BASE_URL } from "./api-base";
import { fetchRead } from "../lib/read-request";
let pending: Promise<WebSession | null> | null = null;
/** Deduplicate concurrent checks only. No identity is retained across navigations. */
export function auth(): Promise<WebSession | null> {
  if (pending) return pending;
  pending = fetchRead(`${API_BASE_URL}/auth/session`, {
    credentials: "include",
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Session unavailable");
      return response.json() as Promise<WebSession | null>;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
