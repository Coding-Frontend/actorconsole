import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SERVER_API_BASE_URL } from "./api-base";
import type { WebSession } from "@actorconsole/shared/web-session";

/** Request-scoped identity validated by the API, without frontend database access. */
export const auth = cache(async (): Promise<WebSession | null> => {
  const store = await cookies();
  if (!store.get("__Secure-authjs.session-token") && !store.get("authjs.session-token")) return null;
  const response = await fetch(SERVER_API_BASE_URL + "/auth/session", {
    headers: { cookie: store.toString() }, cache: "no-store", signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Session API unavailable (" + response.status + ")");
  return response.json();
});
