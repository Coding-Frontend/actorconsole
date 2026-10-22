import { parse } from "hono/utils/cookie";
import { db } from "@actorconsole/db";
import type { WebSession } from "@actorconsole/shared/web-session";
import { currentRequest } from "./http-context.js";

export async function readWebSession(request: Request): Promise<WebSession | null> {
  const cookies = parse(request.headers.get("cookie") ?? "");
  const token = cookies["__Secure-authjs.session-token"] ?? cookies["authjs.session-token"];
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { sessionToken: token },
    select: {
      expires: true, impersonatedById: true, impersonationExpiresAt: true,
      user: { select: {
        id: true, email: true, name: true, image: true, plan: true, role: true,
        suspendedAt: true, deletionScheduledFor: true,
      } },
    },
  });
  if (!session || session.expires <= new Date() ||
      (session.impersonationExpiresAt && session.impersonationExpiresAt <= new Date())) return null;
  const { user } = session;
  return {
    expires: session.expires.toISOString(),
    user: {
      id: user.id, email: user.email, name: user.name, image: user.image, plan: user.plan, role: user.role,
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
      deletionScheduledFor: user.deletionScheduledFor?.toISOString() ?? null,
    },
    mimic: session.impersonatedById && session.impersonationExpiresAt && cookies["actorconsole.original-session"]
      ? { user: { id: user.id, email: user.email, name: user.name }, expiresAt: session.impersonationExpiresAt.toISOString() }
      : null,
  };
}

export function auth() { return readWebSession(currentRequest()); }
