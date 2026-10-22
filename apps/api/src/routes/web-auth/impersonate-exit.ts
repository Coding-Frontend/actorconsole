import { JsonResponse } from "../../lib/http-context.js";
import { requestCookies } from "../../lib/http-context.js";
import { db } from "@actorconsole/db";
import {
  ORIGINAL_SESSION_COOKIE,
  ORIGINAL_WORKSPACE_COOKIE,
  WORKSPACE_COOKIE,
} from "../../lib/impersonation.js";
import { getAuthSessionCookieName, usesSecureAuthSessionCookie } from "../../lib/auth-session-cookie.js";


export async function POST() {
  const store = await requestCookies();
  const secureCookie = store.get("__Secure-authjs.session-token");
  const target = secureCookie ?? store.get("authjs.session-token");
  const original = store.get(ORIGINAL_SESSION_COOKIE);
  if (!original?.value)
    return JsonResponse.json({ ok: false, error: "No active mimic session" }, { status: 409 });
  const adminSession = await db.session.findUnique({
    where: { sessionToken: original.value },
    include: { user: true },
  });
  if (
    !adminSession ||
    adminSession.expires <= new Date() ||
    adminSession.impersonatedById ||
    adminSession.user.suspendedAt ||
    !["ADMIN", "SUPER_ADMIN"].includes(adminSession.user.role)
  ) {
    return JsonResponse.json(
      { ok: false, error: "Your administrator session has expired. Please sign in again." },
      { status: 401 },
    );
  }
  const mimicSession = target?.value
    ? await db.session.findUnique({ where: { sessionToken: target.value } })
    : null;
  if (mimicSession && mimicSession.impersonatedById !== adminSession.userId) {
    return JsonResponse.json(
      { ok: false, error: "Mimic session does not belong to this administrator" },
      { status: 403 },
    );
  }
  if (mimicSession) {
    await db.$transaction([
      db.session.deleteMany({
        where: { id: mimicSession.id, impersonatedById: adminSession.userId },
      }),
      db.auditLog.create({
        data: {
          adminId: adminSession.userId,
          actorId: mimicSession.userId,
          action: "user.impersonation.exited",
          resource: `user:${mimicSession.userId}`,
          source: "ui",
        },
      }),
    ]);
  }
  const redirectTo = mimicSession
    ? `/admin/users/${encodeURIComponent(mimicSession.userId)}`
    : "/admin/users";
  const response = JsonResponse.json({ ok: true, data: { redirectTo } });
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: Boolean(secureCookie) || usesSecureAuthSessionCookie(),
    path: "/",
  };
  const cookieName = target
    ? secureCookie
      ? "__Secure-authjs.session-token"
      : "authjs.session-token"
    : getAuthSessionCookieName();
  response.cookies.set(cookieName, original.value, { ...options, expires: adminSession.expires });
  const workspace = store.get(ORIGINAL_WORKSPACE_COOKIE)?.value;
  response.cookies.set(WORKSPACE_COOKIE, workspace ?? "", {
    ...options,
    maxAge: workspace ? 365 * 24 * 60 * 60 : 0,
  });
  response.cookies.set(ORIGINAL_SESSION_COOKIE, "", { ...options, maxAge: 0 });
  response.cookies.set(ORIGINAL_WORKSPACE_COOKIE, "", { ...options, maxAge: 0 });
  return response;
}
