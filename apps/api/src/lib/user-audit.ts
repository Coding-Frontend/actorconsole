import type { Context } from "hono";
import { db } from "@actorconsole/db";
import type { UserSession } from "@actorconsole/shared";

/**
 * Record user mutations made through either the dashboard cookie or a
 * personal API key. The admin audit screen can therefore explain MCP/API
 * changes using the same event stream as UI changes.
 */
export async function recordUserAudit(
  c: Context,
  session: UserSession,
  action: string,
  resource: string,
  after?: unknown,
): Promise<void> {
  const auditLog = (db as typeof db & { auditLog?: typeof db.auditLog }).auditLog;
  if (!auditLog) return;
  const authorization = c.req.header("authorization") ?? "";
  const source = /^Bearer\s+al_/i.test(authorization) ? "api-key" : "ui";
  await auditLog.create({
    data: {
      actorId: session.userId,
      action,
      resource,
      after: after as object | undefined,
      source,
      ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    },
  });
}
