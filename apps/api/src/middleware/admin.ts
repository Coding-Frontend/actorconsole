import type { Context, Next } from "hono";
import { db } from "@actorconsole/db";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../app.js";
import { createHash, timingSafeEqual } from "node:crypto";

function secureEqual(left: string, right: string | undefined): boolean {
  if (!right) return false;
  return timingSafeEqual(
    createHash("sha256").update(left).digest(),
    createHash("sha256").update(right).digest(),
  );
}

declare module "hono" {
  interface ContextVariableMap {
    session: import("@actorconsole/shared").UserSession;
    adminSession: {
      adminId: string;
      email: string;
      role: "USER" | "ADMIN" | "SUPER_ADMIN";
      viaApiKey?: boolean;
    };
  }
}

export function requireAdmin() {
  return async (
    c: Context<{ Variables: AppEnv["Variables"] & { adminSession: any } }>,
    next: Next,
  ) => {
    const apiKey = c.req.header("x-admin-api-key");
    const cookieSession =
      getCookie(c, "__Secure-authjs.session-token") ?? getCookie(c, "authjs.session-token") ??
      c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? c.req.header("x-session-token");

    // Trusted service callers can use a backend key; the web panel uses session cookies.
    if (apiKey && secureEqual(apiKey, process.env.ADMIN_API_KEY)) {
      c.set("adminSession" as any, {
        adminId: "service",
        email: "service@actorconsole.local",
        role: "SUPER_ADMIN",
        viaApiKey: true,
      });
      return next();
    }

    if (!cookieSession) {
      return c.json({ ok: false, error: { code: "unauthenticated" } }, 401);
    }

    const session = await db.session.findUnique({
      where: { sessionToken: cookieSession },
      include: { user: true },
    });

    if (!session || session.expires < new Date()) {
      return c.json({ ok: false, error: { code: "session_expired" } }, 401);
    }
    if (session.impersonatedById) {
      return c.json(
        {
          ok: false,
          error: { code: "forbidden", message: "Return to your administrator session first" },
        },
        403,
      );
    }
    if (session.user.suspendedAt) {
      return c.json({ ok: false, error: { code: "account_suspended" } }, 403);
    }
    if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return c.json({ ok: false, error: { code: "forbidden" } }, 403);
    }

    c.set("adminSession" as any, {
      adminId: session.user.id,
      email: session.user.email,
      role: session.user.role,
    });
    return next();
  };
}
