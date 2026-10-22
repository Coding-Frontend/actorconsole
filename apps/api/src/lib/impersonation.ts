import { requestCookies } from "./http-context.js";
import { db } from "@actorconsole/db";

export const ORIGINAL_SESSION_COOKIE = "actorconsole.original-session";
export const ORIGINAL_WORKSPACE_COOKIE = "actorconsole.original-workspace";
export const WORKSPACE_COOKIE = "actorconsole.business-profile";

export interface MimicStatus {
  user: { id: string; name: string | null; email: string };
  expiresAt: string;
}

export async function getMimicStatus(): Promise<MimicStatus | null> {
  const store = await requestCookies();
  const token = store.get("__Secure-authjs.session-token") ?? store.get("authjs.session-token");
  if (!token?.value || !store.get(ORIGINAL_SESSION_COOKIE)?.value) return null;
  const session = await db.session.findUnique({
    where: { sessionToken: token.value },
    select: {
      impersonatedById: true,
      impersonationExpiresAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!session?.impersonatedById || !session.impersonationExpiresAt) return null;
  return { user: session.user, expiresAt: session.impersonationExpiresAt.toISOString() };
}
