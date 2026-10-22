import { NextResponse, type NextRequest } from "next/server";
import { SERVER_API_BASE_URL } from "@/lib/api-base";
import {
  isRestrictedDashboardPath,
  isWorkspaceAccess,
  WORKSPACE_ACCESS_HEADER,
  WORKSPACE_UPGRADE_PATH,
} from "@actorconsole/shared/workspace-access";

/** Cookie presence gates navigation; the API validates sessions and roles for server rendering and every protected endpoint. */
export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const legacySettingsRoutes: Record<string, string> = {
    "/dashboard/settings": "/dashboard/apify",
    "/dashboard/settings/api-keys": "/dashboard/mcp",
    "/dashboard/api-keys": "/dashboard/mcp",
    "/dashboard/settings/profile": "/dashboard/profile",
    "/dashboard/settings/notifications": "/dashboard/notification-preferences",
    "/dashboard/settings/billing": "/dashboard/billing",
    "/dashboard/settings/export": "/dashboard/data-export",
    "/dashboard/settings/account": "/dashboard/account",
  };
  const replacement = legacySettingsRoutes[pathname];
  if (replacement) {
    return NextResponse.redirect(new URL(replacement, req.url));
  }

  const sessionToken =
    req.cookies.get("authjs.session-token")?.value ??
    req.cookies.get("__Secure-authjs.session-token")?.value;

  if (!sessionToken) {
    if (req.cookies.get("actorconsole.original-session")?.value) {
      return NextResponse.redirect(new URL("/mimic-ended", req.url));
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(req.headers);
  // Never trust an access decision supplied by a browser.
  requestHeaders.delete(WORKSPACE_ACCESS_HEADER);
  if (isRestrictedDashboardPath(pathname)) {
    try {
      const response = await fetch(`${SERVER_API_BASE_URL}/account/workspace-access`, {
        headers: { cookie: req.headers.get("cookie") ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status === 401)
        return NextResponse.redirect(
          new URL(`/login?callbackUrl=${encodeURIComponent(pathname)}`, req.url),
        );
      const body = await response.json();
      if (!response.ok || !isWorkspaceAccess(body.data))
        throw new Error("Workspace access unavailable");
      if (body.data.restricted)
        return NextResponse.redirect(new URL(WORKSPACE_UPGRADE_PATH, req.url));
      requestHeaders.set(WORKSPACE_ACCESS_HEADER, JSON.stringify(body.data));
    } catch {
      return NextResponse.redirect(
        new URL(`${WORKSPACE_UPGRADE_PATH}?access=unavailable`, req.url),
      );
    }
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
