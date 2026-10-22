import { Hono } from "hono";
import { db } from "@actorconsole/db";
import {
  MCP_CAPABILITIES,
  MCP_PROMPT_NAMES,
  MCP_PROMPT_CAPABILITIES,
  MCP_PROMPT_ADDITIONAL_CAPABILITIES,
  MCP_RESOURCE_CAPABILITIES,
  MCP_RESOURCE_URIS,
  MCP_TOOL_CAPABILITIES,
  MCP_TOOL_ADDITIONAL_CAPABILITIES,
  MCP_TOOL_NAMES,
} from "@actorconsole/shared";
import type { AppEnv } from "../app.js";
import { assertFeatureEnabled, assertPlanFeature } from "../lib/plan-access.js";
import { requireApiKeyCapability } from "../middleware/api-key-scope.js";

/** Workspace-bound discovery and usage endpoints consumed by the MCP server. */
export const mcpProxyRoutes = new Hono<AppEnv>().get("/info", async (c) => {
  const session = c.get("session");
  await assertPlanFeature(session, "mcp_access");
  await assertFeatureEnabled("mcp_self_host", session.userId);

  const granular = (session.apiKeyScopes ?? []).filter((scope) => scope.includes(":"));
  const permissions = granular.length > 0 ? granular : [...MCP_CAPABILITIES];

  return c.json({
    ok: true,
    data: {
      name: "actorconsole-mcp",
      version: "0.2.0",
      transport: process.env.MCP_TRANSPORT ?? "stdio",
      port: Number(process.env.MCP_PORT ?? 4100),
      docs: `${process.env.AUTH_URL ?? "http://localhost:8080"}/docs/mcp-tools`,
      authentication: {
        http: "Bearer <workspace MCP credential>",
        stdio: "ACTORCONSOLE_API_KEY",
      },
      permissions,
      actorScope: session.apiKeyActorIds?.length ? session.apiKeyActorIds : "all",
      tools: MCP_TOOL_NAMES.filter((tool) => {
        const required = MCP_TOOL_CAPABILITIES[tool];
        const additional = MCP_TOOL_ADDITIONAL_CAPABILITIES[tool] ?? [];
        return (
          (!required || permissions.includes(required)) &&
          additional.every((capability) => permissions.includes(capability))
        );
      }),
      resources: MCP_RESOURCE_URIS.filter((uri) =>
        permissions.includes(MCP_RESOURCE_CAPABILITIES[uri]),
      ),
      prompts: MCP_PROMPT_NAMES.filter(
        (prompt) =>
          permissions.includes(MCP_PROMPT_CAPABILITIES[prompt]) &&
          (MCP_PROMPT_ADDITIONAL_CAPABILITIES[prompt] ?? []).every((capability) =>
            permissions.includes(capability),
          ),
      ),
    },
  });
});

mcpProxyRoutes.get("/workspace", requireApiKeyCapability("workspace:read"), async (c) => {
  const session = c.get("session");
  await assertPlanFeature(session, "mcp_access");
  await assertFeatureEnabled("mcp_self_host", session.userId);
  const workspace = session.businessProfileId
    ? await db.businessProfile.findFirst({
        where: { id: session.businessProfileId, userId: session.userId },
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          createdAt: true,
          updatedAt: true,
          apifyTokens: {
            take: 1,
            orderBy: { updatedAt: "desc" },
            select: {
              apifyUserId: true,
              apifyUsername: true,
              apiTokenStatus: true,
              uiTokenStatus: true,
              cookiesStatus: true,
              validatedAt: true,
            },
          },
        },
      })
    : null;
  const granular = (session.apiKeyScopes ?? []).filter((scope) => scope.includes(":"));
  const token = workspace?.apifyTokens[0] ?? null;
  const workspaceData = workspace
    ? {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        plan: workspace.plan,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        apifyConnection: {
          connected: Boolean(token),
          apifyUserId: token?.apifyUserId ?? null,
          username: token?.apifyUsername ?? null,
          apiTokenStatus: token?.apiTokenStatus ?? "NOT_CONFIGURED",
          uiTokenStatus: token?.uiTokenStatus ?? "NOT_CONFIGURED",
          cookiesStatus: token?.cookiesStatus ?? "NOT_CONFIGURED",
          validatedAt: token?.validatedAt ?? null,
        },
      }
    : null;
  return c.json({
    ok: true,
    data: {
      workspace: workspaceData,
      permissions: granular.length > 0 ? granular : [...MCP_CAPABILITIES],
      actorScope: session.apiKeyActorIds?.length ? session.apiKeyActorIds : "all",
    },
  });
});

mcpProxyRoutes.get("/usage", requireApiKeyCapability("workspace:read"), async (c) => {
  const session = c.get("session");
  await assertPlanFeature(session, "mcp_access");
  await assertFeatureEnabled("mcp_self_host", session.userId);
  const days = Math.min(90, Math.max(1, Number(c.req.query("days")) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
  const logs = await db.auditLog.findMany({
    where: {
      actorId: session.userId,
      source: "mcp",
      resource: `workspace:${session.businessProfileId}`,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 5_000,
    select: { action: true, after: true, createdAt: true },
  });
  const matching = logs.filter((log) => {
    const metadata =
      log.after && typeof log.after === "object" && !Array.isArray(log.after)
        ? (log.after as Record<string, unknown>)
        : {};
    return !session.apiKeyId || metadata.apiKeyId === session.apiKeyId;
  });
  const byTool = new Map<
    string,
    { calls: number; successes: number; failures: number; durationMs: number; lastUsedAt: Date }
  >();
  for (const log of matching) {
    const metadata = log.after as Record<string, unknown>;
    const tool =
      typeof metadata.tool === "string" ? metadata.tool : log.action.replace(/^mcp\./, "");
    const row = byTool.get(tool) ?? {
      calls: 0,
      successes: 0,
      failures: 0,
      durationMs: 0,
      lastUsedAt: log.createdAt,
    };
    row.calls += 1;
    if (metadata.status === "success") row.successes += 1;
    else row.failures += 1;
    row.durationMs += typeof metadata.durationMs === "number" ? metadata.durationMs : 0;
    if (log.createdAt > row.lastUsedAt) row.lastUsedAt = log.createdAt;
    byTool.set(tool, row);
  }
  return c.json({
    ok: true,
    data: {
      days,
      totalCalls: matching.length,
      tools: [...byTool.entries()]
        .map(([tool, row]) => ({
          tool,
          calls: row.calls,
          successes: row.successes,
          failures: row.failures,
          averageDurationMs: row.calls ? Math.round(row.durationMs / row.calls) : 0,
          lastUsedAt: row.lastUsedAt.toISOString(),
        }))
        .sort((left, right) => right.calls - left.calls),
      truncated: logs.length === 5_000,
    },
  });
});

mcpProxyRoutes.get("/health", async (c) => {
  const session = c.get("session");
  await assertPlanFeature(session, "mcp_access");
  await assertFeatureEnabled("mcp_self_host", session.userId);
  const base =
    process.env.MCP_INTERNAL_URL ?? `http://127.0.0.1:${Number(process.env.MCP_PORT ?? 4100)}`;
  const started = Date.now();
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    const rawBody = await response.json().catch(() => null);
    const body =
      rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>)
        : {};
    return c.json(
      { ok: response.ok, data: { ...body, latencyMs: Date.now() - started } },
      response.ok ? 200 : 503,
    );
  } catch {
    return c.json(
      {
        ok: false,
        error: { code: "mcp_unavailable", message: "MCP transport is unavailable" },
        data: { latencyMs: Date.now() - started },
      },
      503,
    );
  }
});
