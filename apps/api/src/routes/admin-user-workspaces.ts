import { Hono } from "hono";
import { db } from "@actorconsole/db";
import type { AppEnv } from "../app.js";
import { enumQuery, integerQuery, limitQuery } from "../lib/query.js";
import { readWorkspaceFinancialReport } from "./actors.js";

export const adminUserWorkspaceRoutes = new Hono<AppEnv>()
  .get("/:userId/workspaces/:workspaceId/analytics/:kind", async (c, next) => {
    enumQuery(c.req.param("kind"), "kind", ["usage", "costs", "revenue"] as const);
    const workspace = await db.businessProfile.findFirst({
      where: { id: c.req.param("workspaceId"), userId: c.req.param("userId") },
      select: { id: true, userId: true, plan: true, user: { select: { email: true } } },
    });
    if (!workspace) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    c.set("session", {
      userId: workspace.userId,
      email: workspace.user.email,
      plan: workspace.plan,
      businessProfileId: workspace.id,
    });
    return readWorkspaceFinancialReport(c, next);
  })
  .get("/:userId/workspaces/:workspaceId", async (c) => {
    const userId = c.req.param("userId");
    const id = c.req.param("workspaceId");
    const section =
      enumQuery(c.req.query("section"), "section", [
        "actors",
        "schedules",
        "notifications",
        "operations",
        "improvements",
        "keywords",
        "searches",
        "api-keys",
        "subscriptions",
        "payments",
        "support",
        "activity",
      ] as const) ?? "actors";
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 25, 100);
    // Resolve both IDs together before reading any workspace data.
    const workspace = await db.businessProfile.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        industry: true,
        website: true,
        isDefault: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            suspendedAt: true,
            deletionScheduledFor: true,
          },
        },
        apifyTokens: {
          select: {
            apifyUsername: true,
            apifyUserId: true,
            consoleUserId: true,
            apiTokenStatus: true,
            uiTokenStatus: true,
            cookiesStatus: true,
            validatedAt: true,
            validationError: true,
          },
        },
        notificationPreference: {
          select: { marketing: true, product: true, billing: true, security: true },
        },
        _count: {
          select: {
            actors: true,
            bulkPublishSchedules: true,
            notifications: true,
            bulkActorStatusOperations: true,
            actorOptimizationRuns: true,
            keywordWatches: true,
            keywordSearches: true,
            apiKeys: true,
            subscriptions: true,
            payments: true,
            tickets: true,
          },
        },
      },
    });
    if (!workspace)
      return c.json(
        { ok: false, error: { code: "not_found", message: "Workspace not found for this user" } },
        404,
      );

    const query = {
      where: { userId, businessProfileId: id },
      orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
      skip: (page - 1) * limit,
      take: limit,
    };
    let items: unknown[] = [];
    let total = 0;
    switch (section) {
      case "actors":
        items = await db.actor.findMany({
          ...query,
          select: {
            id: true,
            apifyActorId: true,
            username: true,
            actorName: true,
            title: true,
            storeIsPublic: true,
            storeIsDeprecated: true,
            publishReady: true,
            lastOperationalSyncAt: true,
            lastRunSyncAt: true,
            createdAt: true,
          },
        });
        total = workspace._count.actors;
        break;
      case "schedules":
        items = await db.bulkPublishSchedule.findMany({
          ...query,
          select: {
            id: true,
            name: true,
            cronExpr: true,
            dailyLimit: true,
            enabled: true,
            lastRunAt: true,
            nextRunAt: true,
            quotaBlockedUntil: true,
            _count: { select: { actors: true } },
            runs: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                status: true,
                attemptedCount: true,
                publishedCount: true,
                stoppedReason: true,
              },
            },
          },
        });
        total = workspace._count.bulkPublishSchedules;
        break;
      case "notifications":
        items = await db.notification.findMany({
          ...query,
          select: { id: true, type: true, title: true, body: true, readAt: true, createdAt: true },
        });
        total = workspace._count.notifications;
        break;
      case "operations":
        items = await db.bulkActorStatusOperation.findMany({
          ...query,
          select: {
            id: true,
            action: true,
            status: true,
            actorCount: true,
            succeededCount: true,
            failedCount: true,
            error: true,
            createdAt: true,
          },
        });
        total = workspace._count.bulkActorStatusOperations;
        break;
      case "improvements":
        items = await db.actorOptimizationRun.findMany({
          ...query,
          select: {
            id: true,
            kind: true,
            status: true,
            totalCount: true,
            completedCount: true,
            appliedCount: true,
            failedCount: true,
            createdAt: true,
          },
        });
        total = workspace._count.actorOptimizationRuns;
        break;
      case "keywords":
        items = await db.keywordWatch.findMany({
          ...query,
          select: {
            id: true,
            keyword: true,
            searchCount: true,
            latestResultCount: true,
            difficultyScore: true,
            lastSearchedAt: true,
          },
        });
        total = workspace._count.keywordWatches;
        break;
      case "searches":
        items = await db.keywordSearch.findMany({
          ...query,
          select: {
            id: true,
            keyword: true,
            resultCount: true,
            difficultyScore: true,
            createdAt: true,
          },
        });
        total = workspace._count.keywordSearches;
        break;
      case "api-keys":
        items = await db.apiKey.findMany({
          ...query,
          select: {
            id: true,
            name: true,
            keyPreview: true,
            scopes: true,
            lastUsedAt: true,
            expiresAt: true,
            revokedAt: true,
          },
        });
        total = workspace._count.apiKeys;
        break;
      case "subscriptions":
        items = await db.subscription.findMany({
          ...query,
          select: {
            id: true,
            provider: true,
            status: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            createdAt: true,
          },
        });
        total = workspace._count.subscriptions;
        break;
      case "payments":
        items = await db.payment.findMany({
          ...query,
          select: {
            id: true,
            provider: true,
            amount: true,
            currency: true,
            status: true,
            createdAt: true,
          },
        });
        total = workspace._count.payments;
        break;
      case "support":
        items = await db.ticket.findMany({
          ...query,
          select: {
            id: true,
            number: true,
            subject: true,
            status: true,
            priority: true,
            createdAt: true,
          },
        });
        total = workspace._count.tickets;
        break;
      case "activity": {
        // Activity records use actorId for the user and retain workspace scope in after.
        const where = {
          actorId: userId,
          OR: [
            { resource: `workspace:${id}` },
            { after: { path: "$.businessProfileId", equals: id } },
            { after: { path: "$.workspaceId", equals: id } },
          ],
        };
        [items, total] = await Promise.all([
          db.auditLog.findMany({
            ...query,
            where,
            select: { id: true, action: true, resource: true, source: true, createdAt: true },
          }),
          db.auditLog.count({ where }),
        ]);
        break;
      }
    }
    return c.json({ ok: true, data: { workspace, section, items, total, page, limit } });
  });
