import { JsonResponse } from "../../lib/http-context.js";
import { requestCookies } from "../../lib/http-context.js";
import { auth } from "../../lib/web-session.js";
import { db } from "@actorconsole/db";
const SERVER_API_BASE_URL = `http://127.0.0.1:${process.env.API_PORT ?? 4000}`;
import {
  ORIGINAL_SESSION_COOKIE,
  ORIGINAL_WORKSPACE_COOKIE,
  WORKSPACE_COOKIE,
} from "../../lib/impersonation.js";


async function backend(path: string, token: string, body?: unknown) {
  return fetch(`${SERVER_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return JsonResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const admin = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, suspendedAt: true },
  });
  if (!admin || admin.suspendedAt || !["ADMIN", "SUPER_ADMIN"].includes(admin.role)) {
    return JsonResponse.json(
      { ok: false, error: "Administrator access required" },
      { status: 403 },
    );
  }
  const {
    userId,
    workspaceId,
    dashboardPath = "/dashboard",
  } = (await request.json().catch(() => ({}))) as {
    userId?: string;
    workspaceId?: string;
    dashboardPath?: string;
  };
  if (typeof userId !== "string" || !/^[a-zA-Z0-9_-]{1,191}$/.test(userId)) {
    return JsonResponse.json({ ok: false, error: "Invalid user id" }, { status: 400 });
  }
  if (
    typeof dashboardPath !== "string" ||
    !/^\/dashboard(?:\/[a-zA-Z0-9_-]+)*$/.test(dashboardPath)
  ) {
    return JsonResponse.json({ ok: false, error: "Invalid dashboard page" }, { status: 400 });
  }
  if (workspaceId !== undefined) {
    if (typeof workspaceId !== "string" || !/^[a-zA-Z0-9_-]{1,191}$/.test(workspaceId)) {
      return JsonResponse.json({ ok: false, error: "Invalid workspace id" }, { status: 400 });
    }
    const workspace = await db.businessProfile.findFirst({
      where: { id: workspaceId, userId },
      select: { id: true },
    });
    if (!workspace)
      return JsonResponse.json(
        { ok: false, error: "Workspace not found for this user" },
        { status: 404 },
      );
  }
  const cookieStore = await requestCookies();
  const secureCookie = cookieStore.get("__Secure-authjs.session-token");
  const sessionCookie = secureCookie ?? cookieStore.get("authjs.session-token");
  if (!sessionCookie?.value)
    return JsonResponse.json({ ok: false, error: "Session expired" }, { status: 401 });
  const originalSession = await db.session.findUnique({
    where: { sessionToken: sessionCookie.value },
    select: { userId: true, expires: true, impersonatedById: true },
  });
  if (
    !originalSession ||
    originalSession.userId !== session.user.id ||
    originalSession.expires <= new Date() ||
    originalSession.impersonatedById
  ) {
    return JsonResponse.json(
      { ok: false, error: "An active administrator session is required" },
      { status: 401 },
    );
  }

  const start = await backend(
    `/admin/users/${encodeURIComponent(userId)}/impersonate`,
    sessionCookie.value,
  );
  const startBody = (await start.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: { token?: string; expiresAt?: string };
    error?: { message?: string };
  };
  if (!start.ok || !startBody.ok || !startBody.data?.token) {
    return JsonResponse.json(
      { ok: false, error: startBody.error?.message ?? "Could not start impersonation" },
      { status: start.status },
    );
  }
  const consume = await backend("/admin/impersonation/consume", sessionCookie.value, {
    token: startBody.data.token,
  });
  const consumeBody = (await consume.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: { sessionToken?: string; expiresAt?: string };
    error?: { message?: string };
  };
  if (!consume.ok || !consumeBody.ok || !consumeBody.data?.sessionToken) {
    return JsonResponse.json(
      { ok: false, error: consumeBody.error?.message ?? "Could not create impersonation session" },
      { status: consume.status },
    );
  }

  const response = JsonResponse.json({
    ok: true,
    data: { expiresAt: consumeBody.data.expiresAt, redirectTo: dashboardPath },
  });
  const secure = Boolean(secureCookie) || process.env.NODE_ENV === "production";
  const cookieName = secureCookie ? "__Secure-authjs.session-token" : "authjs.session-token";
  response.cookies.set(ORIGINAL_SESSION_COOKIE, sessionCookie.value, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: originalSession.expires,
  });
  response.cookies.set(ORIGINAL_WORKSPACE_COOKIE, cookieStore.get(WORKSPACE_COOKIE)?.value ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: originalSession.expires,
  });
  response.cookies.set(WORKSPACE_COOKIE, workspaceId ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: workspaceId ? 15 * 60 : 0,
  });
  response.cookies.set(cookieName, consumeBody.data.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(consumeBody.data.expiresAt!),
  });
  return response;
}
