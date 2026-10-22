import type { Context, Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db } from "@actorconsole/db";
import type { UserSession } from "@actorconsole/shared";
import { AppError } from "../middleware/error.js";

export const BUSINESS_PROFILE_COOKIE = "actorconsole.business-profile";
export const BUSINESS_PROFILE_HEADER = "x-business-profile-id";

const cookieOptions = {
  httpOnly: true,
  sameSite: "Lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

export function businessProfileScope(session: Pick<UserSession, "businessProfileId">) {
  // Never widen a workspace-scoped query to every workspace when onboarding
  // has not created/selected one yet.
  return { businessProfileId: session.businessProfileId ?? "__workspace_required__" };
}

function slugify(value: string) {
  return (
    value
      .toLocaleLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "workspace"
  );
}

export async function getActiveBusinessProfile(c: Context, userId: string) {
  const requestedId =
    c.req.header(BUSINESS_PROFILE_HEADER) ?? getCookie(c, BUSINESS_PROFILE_COOKIE);
  let profile = requestedId
    ? await db.businessProfile.findFirst({ where: { id: requestedId, userId } })
    : null;

  if (!profile) {
    profile = await db.businessProfile.findFirst({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  if (!profile) {
    if (requestedId && !c.req.header(BUSINESS_PROFILE_HEADER)) {
      deleteCookie(c, BUSINESS_PROFILE_COOKIE, { path: "/" });
    }
    return null;
  }

  // A malformed/stale profile cookie should self-heal to the user's first
  // valid profile instead of leaking an empty or cross-workspace response.
  if (requestedId !== profile.id && !c.req.header(BUSINESS_PROFILE_HEADER)) {
    setCookie(c, BUSINESS_PROFILE_COOKIE, profile.id, cookieOptions);
  }

  return profile;
}

export function resolveBusinessProfile({ required = true }: { required?: boolean } = {}) {
  return async (c: Context, next: Next) => {
    const session = c.get("session") as UserSession | undefined;
    if (session?.userId) {
      // API and MCP keys are permanently bound to the workspace that created
      // them. Browser cookies and x-business-profile-id must never widen a
      // key into another workspace owned by the same user.
      const profile =
        session.authMethod === "api-key" && session.businessProfileId
          ? await db.businessProfile.findFirst({
              where: { id: session.businessProfileId, userId: session.userId },
            })
          : await getActiveBusinessProfile(c, session.userId);
      if (!profile && required) {
        throw new AppError(
          "workspace_required",
          "Create a workspace before using ActorConsole features",
          409,
        );
      }
      c.set("session", {
        ...session,
        ...(profile ? { businessProfileId: profile.id, plan: profile.plan } : {}),
      });
    }
    await next();
  };
}

export function setActiveBusinessProfile(c: Context, profileId: string) {
  setCookie(c, BUSINESS_PROFILE_COOKIE, profileId, cookieOptions);
}

export { slugify };
