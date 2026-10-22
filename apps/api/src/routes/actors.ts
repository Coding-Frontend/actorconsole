import { Hono, type Handler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { admitWorkspaceActors, db, Prisma } from "@actorconsole/db";
import {
  updateActorCopySchema,
  inferActorLanguage,
  extractKeywords,
  actorPricingSchema,
} from "@actorconsole/shared";
import {
  APIFY_ACCOUNT_MISMATCH_CODE,
  getAdminApifyClient,
  getUserApifyClient,
  validateUserApifyAccountMatch,
} from "@actorconsole/apify";
import type {
  ApifyActorMonetizationItem,
  ApifyActorSummary,
  ApifyPricingInfo,
  ApifyStoreSearchResult,
} from "@actorconsole/apify";
import { AppError } from "../middleware/error.js";
import { rewriteActorCopy } from "@actorconsole/ai";
import { checkRateLimit } from "../lib/rate-limit";
import { trackEvent } from "../lib/analytics";
import { cacheSet } from "../lib/cache.js";
import { enumQuery, integerQuery, limitQuery, stringQuery } from "../lib/query.js";
import {
  assertFeatureEnabled,
  assertPlanFeature,
  refreshWorkspacePlanUsage,
} from "../lib/plan-access.js";
import { recordUserAudit } from "../lib/user-audit.js";
import {
  assertApiKeyActorScope,
  assertApiKeyCapability,
  assertApiKeyUnscoped,
} from "../middleware/api-key-scope.js";
import { loadWorkspaceFinancialReport } from "../lib/financial-report.js";
import { businessProfileScope } from "../lib/business-profile.js";
import type { AppEnv } from "../app.js";

// Dashboard detail reads return the database record immediately. A short
// refresh window keeps that fast path responsive while a worker snapshot
// brings runs, usage, pricing, and insight charts up to date in the background.
const ACTOR_DETAIL_REFRESH_MS = 15 * 60 * 1_000;
const actorCategoryFeedbackSchema = z.object({
  details: z.string().trim().min(10).max(2_000),
});

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const actorReadinessFilterSchema = z.enum([
  "all",
  "ready",
  "needs-attention",
  "unknown",
  "missing-description",
  "missing-readme",
  "missing-input-schema",
  "missing-output-schema",
  "missing-key-value-store-schema",
  "missing-tagged-build",
  "missing-public-profile",
  "email-not-verified",
  "disposable-email",
]);

function actorReadinessWhere(readiness: z.infer<typeof actorReadinessFilterSchema>) {
  switch (readiness) {
    case "ready":
      return { publishReady: true };
    case "needs-attention":
      return {
        OR: [
          { publishReady: false },
          { hasDescription: false },
          { hasInputSchema: false },
          { hasOutputSchema: false },
          { hasKeyValueSchema: false },
          { hasTaggedBuild: false },
          { hasPublicProfile: false },
          { hasVerifiedEmail: false },
          { hasNonDisposableEmail: false },
        ],
      };
    case "unknown":
      return { OR: [{ readinessSyncedAt: null }, { publishReady: null }] };
    case "missing-description":
      return { hasDescription: false };
    case "missing-readme":
      return { hasReadme: false };
    case "missing-input-schema":
      return { hasInputSchema: false };
    case "missing-output-schema":
      return { hasOutputSchema: false };
    case "missing-key-value-store-schema":
      return { hasKeyValueSchema: false };
    case "missing-tagged-build":
      return { hasTaggedBuild: false };
    case "missing-public-profile":
      return { hasPublicProfile: false };
    case "email-not-verified":
      return { hasVerifiedEmail: false };
    case "disposable-email":
      return { hasNonDisposableEmail: false };
    default:
      return {};
  }
}

function dashboardActorWhere(input: {
  userId: string;
  scope: Record<string, unknown>;
  apiKeyActorIds?: string[];
  q: string;
  readiness: z.infer<typeof actorReadinessFilterSchema>;
}) {
  return {
    userId: input.userId,
    ...input.scope,
    apifyRemovedAt: null,
    ...(input.apiKeyActorIds?.length ? { apifyActorId: { in: input.apiKeyActorIds } } : {}),
    AND: [
      actorReadinessWhere(input.readiness),
      ...(input.q
        ? [
            {
              OR: [
                { title: { contains: input.q } },
                { actorName: { contains: input.q } },
                { username: { contains: input.q } },
              ],
            },
          ]
        : []),
    ],
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function actorPictureFields(actor: {
  currentImageUrl: string | null;
  websiteIdentity?: {
    id: string;
    slug: string;
    name: string;
    canonicalDomain: string | null;
    currentLogo?: { id: string } | null;
  } | null;
  logoRecommendations?: Array<{ id: string; logoId: string; status: string; error: string | null }>;
}) {
  const logoId = actor.websiteIdentity?.currentLogo?.id ?? null;
  const websiteLogoUrl = logoId ? `/api/website-logo-assets/${logoId}` : null;
  return {
    website: actor.websiteIdentity
      ? {
          id: actor.websiteIdentity.id,
          slug: actor.websiteIdentity.slug,
          name: actor.websiteIdentity.name,
          canonicalDomain: actor.websiteIdentity.canonicalDomain,
        }
      : null,
    effectivePictureUrl: actor.currentImageUrl ?? websiteLogoUrl,
    pictureSource: actor.currentImageUrl
      ? ("actor" as const)
      : websiteLogoUrl
        ? ("website" as const)
        : ("fallback" as const),
    pendingLogoRecommendation: actor.logoRecommendations?.[0] ?? null,
  };
}

function actorAnalyticsMonths(now = new Date(), count = 3): string[] {
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - index - 1), 1))
      .toISOString()
      .slice(0, 10),
  );
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * percentileValue)),
  );
  return sorted[index] ?? null;
}

function activePricingInfo(
  pricingInfos: ApifyPricingInfo[] | null | undefined,
  at = new Date(),
): ApifyPricingInfo | undefined {
  const timestamp = at.getTime();
  return [...(pricingInfos ?? [])]
    .filter((pricing) => !pricing.startedAt || Date.parse(pricing.startedAt) <= timestamp)
    .sort((left, right) => {
      const leftTime = left.startedAt ? Date.parse(left.startedAt) : 0;
      const rightTime = right.startedAt ? Date.parse(right.startedAt) : 0;
      return rightTime - leftTime;
    })[0];
}

function priceFromInfo(info: ApifyPricingInfo | undefined): number | null {
  if (!info || info.pricingModel === "FREE") return null;
  if (info.pricingModel === "PAY_PER_EVENT") {
    const events = Object.values(info.pricingPerEvent?.actorChargeEvents ?? {});
    const comparableEvent =
      events.find((event) => event.isPrimaryEvent) ??
      events.find((event) => event.isOneTimeEvent !== true) ??
      events[0];
    return typeof comparableEvent?.eventPriceUsd === "number" && comparableEvent.eventPriceUsd > 0
      ? comparableEvent.eventPriceUsd
      : null;
  }
  return typeof info.pricePerUnitUsd === "number" && info.pricePerUnitUsd > 0
    ? info.pricePerUnitUsd
    : null;
}

function mapPricingCompetitor(
  item: ApifyStoreSearchResult,
  pricingInfos: ApifyPricingInfo[] | undefined = item.pricingInfos,
) {
  const pricing = activePricingInfo(pricingInfos);
  return {
    id: item.id,
    username: item.username,
    name: item.name,
    title: item.title,
    model: pricing?.pricingModel ?? "FREE",
    amount: priceFromInfo(pricing),
    unitName: pricing?.unitName ?? null,
    totalRuns: item.stats?.totalRuns ?? null,
    rating: item.stats?.rating ?? null,
    users30Days: item.stats?.totalUsers30Days ?? item.stats?.monthlyUsers ?? null,
    totalUsers: item.stats?.totalUsers ?? item.totalUsers ?? null,
    reviewCount: item.stats?.actorReviewCount ?? item.reviewCount ?? null,
    url: item.url,
  };
}

async function requireOwnedActor(userId: string, apifyActorId: string, businessProfileId?: string) {
  const actor = await db.actor.findFirst({
    where: { userId, apifyActorId, ...(businessProfileId ? { businessProfileId } : {}) },
  });
  if (!actor) throw new AppError("not_found", `Actor ${apifyActorId} not found`, 404);
  return actor;
}

async function listAllMyActors(apify: {
  listMyActors(options: { limit: number; offset: number }): Promise<ApifyActorSummary[]>;
}): Promise<ApifyActorSummary[]> {
  const actors: ApifyActorSummary[] = [];
  const pageSize = 100;
  for (let offset = 0; offset < 10_000; offset += pageSize) {
    const page = await apify.listMyActors({ limit: pageSize, offset });
    actors.push(...page);
    if (page.length < pageSize) return actors;
  }
  throw new Error("Actor inventory exceeds the sync pagination limit; reconciliation was skipped");
}

async function requireActorApiClient(session: { userId: string; businessProfileId?: string }) {
  if (!session.businessProfileId) {
    throw new AppError("workspace_required", "Select a workspace first", 409);
  }
  const credential = await db.apifyToken.findUnique({
    where: { businessProfileId: session.businessProfileId },
    select: { encryptedToken: true },
  });
  if (!credential?.encryptedToken) {
    throw new AppError(
      "apify_api_key_required",
      "Add an Apify API key to list and sync your Actors. Console credentials add optional metadata and category operations but cannot replace the API key for Actor publication.",
      400,
    );
  }
  const apify = await getUserApifyClient(session.userId, session.businessProfileId);
  if (!apify) {
    throw new AppError(
      "apify_not_connected",
      "The saved Apify API key could not be used. Update it and try again.",
      400,
    );
  }
  return apify;
}

let financialReportHandler: Handler<AppEnv>;
// Read-only aggregation shared by the dashboard and the admin workspace view.
export const readWorkspaceFinancialReport: Handler<AppEnv> = (c, next) =>
  financialReportHandler(c, next);
let financialAccountRefreshHandler: Handler<AppEnv>;
let financialActorSyncHandler: Handler<AppEnv>;

export const actorRoutes: Hono<AppEnv> = new Hono<AppEnv>()
  // Lightweight Actor options for selectors and client-side tools. Keep this
  // response intentionally narrow: full Actor rows can contain large cached
  // README and analytics payloads and made every selector wait on them.
  .get("/", async (c) => {
    const session = c.get("session");
    assertApiKeyCapability(session, "actors:read");
    const status = c.req.query("status") ?? "all";
    if (
      !["all", "published", "maintenance", "deprecated", "unpublished", "publish-ready"].includes(
        status,
      )
    ) {
      throw new AppError("invalid_query", "Invalid actor status filter", 400);
    }
    const limit = limitQuery(c.req.query("limit"), 100, 500);
    const page = integerQuery(c.req.query("page"), {
      name: "page",
      defaultValue: 1,
      max: 100_000,
    });
    const q = stringQuery(c.req.query("q"), "q", 120) ?? "";
    const readiness = actorReadinessFilterSchema.catch("all").parse(c.req.query("readiness"));
    const paginated = c.req.query("format") === "page";
    if (!paginated && status === "all" && !q && readiness === "all") {
      const actors = await db.actor.findMany({
        where: {
          userId: session.userId,
          ...businessProfileScope(session),
          apifyRemovedAt: null,
          ...(session.apiKeyActorIds?.length
            ? { apifyActorId: { in: session.apiKeyActorIds } }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          id: true,
          apifyActorId: true,
          title: true,
          actorName: true,
          username: true,
          currentImageUrl: true,
          websiteIdentity: {
            select: {
              id: true,
              slug: true,
              name: true,
              canonicalDomain: true,
              currentLogo: { select: { id: true } },
            },
          },
        },
      });
      return c.json({
        ok: true,
        data: actors.map((actor) => ({ ...actor, ...actorPictureFields(actor) })),
      });
    }
    const statusFilter: Prisma.ActorWhereInput =
      status === "published"
        ? {
            storeIsPublic: true,
            storeIsDeprecated: false,
            NOT: { storeNotice: "UNDER_MAINTENANCE" },
          }
        : status === "maintenance"
          ? { storeNotice: "UNDER_MAINTENANCE" }
          : status === "deprecated"
            ? { storeIsDeprecated: true }
            : status === "unpublished"
              ? { storeIsPublic: false }
              : status === "publish-ready"
                ? { publishReady: true }
                : {};
    const where: Prisma.ActorWhereInput = {
      userId: session.userId,
      ...businessProfileScope(session),
      apifyRemovedAt: null,
      ...(session.apiKeyActorIds?.length ? { apifyActorId: { in: session.apiKeyActorIds } } : {}),
      AND: [
        statusFilter,
        actorReadinessWhere(readiness),
        ...(q
          ? [
              {
                OR: [
                  { title: { contains: q } },
                  { actorName: { contains: q } },
                  { username: { contains: q } },
                  { apifyActorId: { contains: q } },
                ],
              },
            ]
          : []),
      ],
    };
    const select = {
      id: true,
      apifyActorId: true,
      title: true,
      actorName: true,
      username: true,
      description: true,
      currentImageUrl: true,
      currentPricing: true,
      storeIsPublic: true,
      storeIsDeprecated: true,
      storeNotice: true,
      publishReady: true,
      hasDescription: true,
      hasReadme: true,
      hasInputSchema: true,
      hasOutputSchema: true,
      hasKeyValueSchema: true,
      hasTaggedBuild: true,
      hasPublicProfile: true,
      hasVerifiedEmail: true,
      hasNonDisposableEmail: true,
      readinessSyncedAt: true,
      lastOperationalSyncAt: true,
      lastRunSyncAt: true,
      updatedAt: true,
      websiteIdentity: {
        select: {
          id: true,
          slug: true,
          name: true,
          canonicalDomain: true,
          currentLogo: { select: { id: true } },
        },
      },
    } as const;
    const actorsPromise = db.actor.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      ...(paginated ? { skip: (page - 1) * limit } : {}),
      take: limit,
      select,
    });
    if (paginated) {
      const [actors, total] = await Promise.all([actorsPromise, db.actor.count({ where })]);
      const synchronizedAt = actors.reduce<Date | null>((latest, actor) => {
        const candidate = [
          actor.lastOperationalSyncAt,
          actor.lastRunSyncAt,
          actor.readinessSyncedAt,
        ]
          .filter((value): value is Date => Boolean(value))
          .sort((left, right) => right.getTime() - left.getTime())[0];
        return !candidate || (latest && latest >= candidate) ? latest : candidate;
      }, null);
      return c.json({
        ok: true,
        data: {
          items: actors.map((actor) => ({ ...actor, ...actorPictureFields(actor) })),
          total,
          page,
          limit,
          cached: true,
          synchronizedAt: synchronizedAt?.toISOString() ?? null,
        },
      });
    }
    const actors = await actorsPromise;
    return c.json({
      ok: true,
      data: actors.map((actor) => ({ ...actor, ...actorPictureFields(actor) })),
    });
  })

  .get("/plan-usage", async (c) => {
    const session = c.get("session");
    assertApiKeyCapability(session, "actors:read");
    assertApiKeyUnscoped(session);
    if (!session.businessProfileId)
      throw new AppError("workspace_required", "Select a workspace first", 409);
    const usage = await refreshWorkspacePlanUsage(session);
    return c.json({
      ok: true,
      data: usage,
    });
  })

  // Paginated dashboard source keyed by internal actor IDs.
  .get("/dashboard-list", async (c) => {
    const session = c.get("session");
    const q = stringQuery(c.req.query("q"), "q", 120);
    const page = Math.max(1, Number(c.req.query("page")) || 1);
    const limit = limitQuery(c.req.query("limit"), 25, 500);
    const sort = c.req.query("sort") ?? "updated-desc";
    const readiness = actorReadinessFilterSchema.catch("all").parse(c.req.query("readiness"));
    const logoStatus = enumQuery(c.req.query("logoStatus"), "logoStatus", ["pending"] as const);
    const orderBy: any =
      sort === "updated-asc"
        ? { updatedAt: "asc" }
        : sort === "name-asc"
          ? [{ title: "asc" }, { actorName: "asc" }]
          : sort === "name-desc"
            ? [{ title: "desc" }, { actorName: "desc" }]
            : { updatedAt: "desc" };
    const where: any = dashboardActorWhere({
      userId: session.userId,
      scope: businessProfileScope(session),
      apiKeyActorIds: session.apiKeyActorIds,
      q: q ?? "",
      readiness,
    });
    if (logoStatus === "pending") {
      where.logoRecommendations = { some: { status: "PENDING" } };
    }
    const dashboardActorSelect = {
      id: true,
      apifyActorId: true,
      username: true,
      actorName: true,
      title: true,
      description: true,
      currentImageUrl: true,
      publishReady: true,
      hasDescription: true,
      hasReadme: true,
      hasInputSchema: true,
      hasOutputSchema: true,
      hasKeyValueSchema: true,
      hasTaggedBuild: true,
      hasPublicProfile: true,
      hasVerifiedEmail: true,
      hasNonDisposableEmail: true,
      readinessSyncedAt: true,
      storeIsPublic: true,
      storeIsDeprecated: true,
      storeNotice: true,
      lastOperationalSyncAt: true,
      lastRunSyncAt: true,
      updatedAt: true,
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { runs30d: true, usersTotal: true },
      },
      insightSnapshots: {
        orderBy: { capturedOn: "desc" },
        take: 1,
        select: { totalRuns: true, totalUsers: true },
      },
      websiteIdentity: {
        select: {
          id: true,
          slug: true,
          name: true,
          canonicalDomain: true,
          currentLogo: { select: { id: true } },
        },
      },
      logoRecommendations: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: logoStatus === "pending" ? 1 : 0,
        select: { id: true, logoId: true, status: true, error: true },
      },
    } as const;
    const [items, total] = await Promise.all([
      db.actor.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: dashboardActorSelect,
      }),
      db.actor.count({ where }),
    ]);
    return c.json({
      ok: true,
      data: {
        items: items.map((actor) => ({ ...actor, ...actorPictureFields(actor) })),
        total,
        page,
        limit,
        readiness,
        logoStatus: logoStatus ?? "all",
      },
    });
  })

  .get("/dashboard-selection", async (c) => {
    const session = c.get("session");
    const q = stringQuery(c.req.query("q"), "q", 120);
    const readiness = actorReadinessFilterSchema.catch("all").parse(c.req.query("readiness"));
    const items = await db.actor.findMany({
      where: dashboardActorWhere({
        userId: session.userId,
        scope: businessProfileScope(session),
        apiKeyActorIds: session.apiKeyActorIds,
        q: q ?? "",
        readiness,
      }),
      orderBy: [{ title: "asc" }, { actorName: "asc" }],
      take: 10_000,
      select: { id: true },
    });
    return c.json({
      ok: true,
      data: { actorIds: items.map((item) => item.id), total: items.length },
    });
  })

  // Queue a deduplicated workspace refresh. Dashboard reads never wait for
  // this job; clients poll it only after rendering stored database data.
  .post("/refresh", async (c) => {
    const session = c.get("session");
    assertApiKeyUnscoped(session);
    if (!session.businessProfileId) {
      throw new AppError("workspace_required", "Select a workspace first", 409);
    }
    const credential = await db.apifyToken.findUnique({
      where: { businessProfileId: session.businessProfileId },
      select: { encryptedToken: true, apiTokenStatus: true },
    });
    if (!credential?.encryptedToken) {
      throw new AppError(
        "apify_api_key_required",
        "Add an Apify API key before syncing Actors",
        409,
      );
    }
    if (["EXPIRED", "INVALID"].includes(credential.apiTokenStatus)) {
      throw new AppError(
        "apify_api_key_invalid",
        "Update the Apify API key before syncing Actors",
        409,
      );
    }
    const { enqueue } = await import("../lib/queue.js");
    const jobId = await enqueue(
      "snapshots",
      {
        workspaceBootstrap: {
          userId: session.userId,
          businessProfileId: session.businessProfileId,
        },
      },
      {
        deduplication: { id: `workspace-refresh-${session.businessProfileId}` },
        // User-visible inventory sync must not wait behind hundreds of
        // per-Actor insight snapshots on the shared, serial worker.
        lifo: true,
      },
    );
    if (!jobId) throw new AppError("queue_unavailable", "The Actor sync queue is unavailable", 503);
    return c.json({ ok: true, data: { jobId, state: "queued" } }, 202);
  })

  .get("/refresh/:jobId", async (c) => {
    const session = c.get("session");
    const { getQueuedJob } = await import("../lib/queue.js");
    const job = await getQueuedJob("snapshots", c.req.param("jobId"));
    if (!job) throw new AppError("not_found", "Actor refresh was not found", 404);
    const workspace = (
      job.data as { workspaceBootstrap?: { userId?: string; businessProfileId?: string } }
    ).workspaceBootstrap;
    if (
      workspace?.userId !== session.userId ||
      workspace.businessProfileId !== session.businessProfileId
    ) {
      throw new AppError("not_found", "Actor refresh was not found", 404);
    }
    return c.json({
      ok: true,
      data: {
        jobId: String(job.id),
        state: await job.getState(),
        progress: job.progress,
        result: job.returnvalue ?? null,
        error: job.failedReason || null,
      },
    });
  })

  .get(
    "/usage-costs",
    (financialReportHandler = async (c) => {
      return c.json(
        await loadWorkspaceFinancialReport({
          session: c.get("session"),
          query: (key) => c.req.query(key),
          requestId: c.req.header("x-request-id") ?? null,
        }),
      );
    }),
  )

  // Focused dashboard endpoints share the exact same workspace-scoped
  // aggregation as the legacy combined report. Keeping one handler prevents
  // usage, cost, and revenue totals from drifting apart while the clients only
  // render the section relevant to their route.
  .get("/usage", (c, next) => financialReportHandler(c, next))
  .get("/costs", (c, next) => financialReportHandler(c, next))
  .get("/revenue", (c, next) => financialReportHandler(c, next))

  // Live account analytics are refreshed separately so the page can render
  // database history and the last cached response without waiting on Apify.
  .post(
    "/usage-costs/account-refresh",
    (financialAccountRefreshHandler = async (c) => {
      const session = c.get("session");
      await assertPlanFeature(session, "usage_analytics");
      assertApiKeyUnscoped(session);
      const apify = session.businessProfileId
        ? await getUserApifyClient(session.userId, session.businessProfileId)
        : await getUserApifyClient(session.userId);
      if (!apify) {
        throw new AppError("apify_api_key_required", "Add an Apify API key to refresh usage", 409);
      }

      const now = new Date();
      // Keep the same twelve-month window as account usage. This lets the
      // dashboard render day-level historical usage instead of reducing older
      // months to a single total.
      const monthStarts = actorAnalyticsMonths(now, 12).map(
        (month) => new Date(`${month}T00:00:00.000Z`),
      );
      const monthStart = monthStarts.at(-1)!;
      const previousMonthStart = monthStarts.at(-2)!;
      const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const historyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
      const [currentUsageResult, limitsResult] = await Promise.allSettled([
        apify.getAccountMonthlyUsage(),
        apify.getAccountLimits(),
      ] as const);

      type MonthlyUsage = Awaited<ReturnType<(typeof apify)["getMonthlyUsages"]>>;
      type ActorUsageBreakdown = Awaited<ReturnType<(typeof apify)["getActorUsageBreakdown"]>>;
      type ServiceBreakdown = Awaited<
        ReturnType<(typeof apify)["getCurrentBillingCycleServiceBreakdown"]>
      >;
      type CalendarUsage = Awaited<ReturnType<(typeof apify)["getCalendarMonthUsage"]>>;
      let monthly: MonthlyUsage | null = null;
      let currentActors: ActorUsageBreakdown | null = null;
      let previousActors: ActorUsageBreakdown | null = null;
      let currentServices: ServiceBreakdown | null = null;
      let calendarMonth: {
        dailyServiceUsage: CalendarUsage["dailyServiceUsage"];
        monthlyServiceUsage: CalendarUsage["monthlyServiceUsage"];
      } | null = null;
      let ownerMonetization: {
        month: string;
        actors: ApifyActorMonetizationItem[];
        coveredActors: number;
        failedActors: number;
      } | null = null;
      let unavailable = [currentUsageResult, limitsResult].filter(
        (result) => result.status === "rejected",
      ).length;
      let credentialIssue: { code: string; message: string } | null = null;

      try {
        const accountMatch = await validateUserApifyAccountMatch(
          session.userId,
          session.businessProfileId,
        );
        if (accountMatch.matches === false) {
          credentialIssue = {
            code: APIFY_ACCOUNT_MISMATCH_CODE,
            message:
              accountMatch.message ??
              "The Apify API key and Console publishing credentials belong to different accounts.",
          };
        }
      } catch (error) {
        credentialIssue = {
          code: "APIFY_CONSOLE_AUTHENTICATION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Apify Console authentication failed. Update the publishing credential.",
        };
      }

      if (!credentialIssue) {
        const workspaceActors = await db.actor.findMany({
          where: { userId: session.userId, ...businessProfileScope(session) },
          select: { apifyActorId: true },
        });
        const monetizationBatches = Array.from(
          { length: Math.ceil(workspaceActors.length / 30) },
          (_, index) => workspaceActors.slice(index * 30, index * 30 + 30),
        );
        const monetizationResults: Array<{
          batchSize: number;
          result: PromiseSettledResult<Awaited<ReturnType<typeof apify.getActorMonetization>>>;
        }> = [];
        // Console accepts at most 30 Actor IDs. Five concurrent batches keep a
        // large organization responsive without issuing hundreds of per-Actor
        // analytics calls or tripping Console rate limits.
        for (let index = 0; index < monetizationBatches.length; index += 5) {
          const round = monetizationBatches.slice(index, index + 5);
          const settled = await Promise.allSettled(
            round.map((batch) =>
              apify.getActorMonetization(
                batch.map((actor) => actor.apifyActorId),
                monthStarts.at(-1)!.toISOString().slice(0, 10),
              ),
            ),
          );
          monetizationResults.push(
            ...settled.map((result, resultIndex) => ({
              batchSize: round[resultIndex]!.length,
              result,
            })),
          );
        }
        ownerMonetization = {
          month: monthStarts.at(-1)!.toISOString().slice(0, 7),
          actors: monetizationResults.flatMap(({ result }) =>
            result.status === "fulfilled" ? (result.value.monetizationPerActor ?? []) : [],
          ),
          coveredActors: monetizationResults.reduce(
            (total, { batchSize, result }) =>
              total + (result.status === "fulfilled" ? batchSize : 0),
            0,
          ),
          failedActors: monetizationResults.reduce(
            (total, { batchSize, result }) =>
              total + (result.status === "rejected" ? batchSize : 0),
            0,
          ),
        };

        const [consoleResults, calendarResults] = await Promise.all([
          Promise.allSettled([
            apify.getMonthlyUsages(historyStart.toISOString(), now.toISOString()),
            apify.getActorUsageBreakdown(monthStart.toISOString(), nextMonthStart.toISOString()),
            apify.getActorUsageBreakdown(
              previousMonthStart.toISOString(),
              monthStart.toISOString(),
            ),
            apify.getCurrentBillingCycleServiceBreakdown(),
          ] as const),
          Promise.allSettled(
            monthStarts.map((start) => apify.getCalendarMonthUsage(start.toISOString())),
          ),
        ]);
        const [monthlyResult, currentActorsResult, previousActorsResult, servicesResult] =
          consoleResults;
        monthly = monthlyResult.status === "fulfilled" ? monthlyResult.value : null;
        currentActors =
          currentActorsResult.status === "fulfilled" ? currentActorsResult.value : null;
        previousActors =
          previousActorsResult.status === "fulfilled" ? previousActorsResult.value : null;
        currentServices = servicesResult.status === "fulfilled" ? servicesResult.value : null;
        const dailyServiceUsage = Object.assign(
          {},
          ...calendarResults.map((result) =>
            result.status === "fulfilled" ? result.value.dailyServiceUsage : {},
          ),
        );
        const latestCalendar = calendarResults.at(-1);
        calendarMonth = {
          dailyServiceUsage,
          monthlyServiceUsage:
            latestCalendar?.status === "fulfilled" ? latestCalendar.value.monthlyServiceUsage : {},
        };
        unavailable += [...consoleResults, ...calendarResults].filter(
          (result) => result.status === "rejected",
        ).length;
        unavailable += monetizationResults.filter(
          ({ result }) => result.status === "rejected",
        ).length;
      }

      const value = {
        syncedAt: now.toISOString(),
        monthly,
        actors: {
          current: currentActors,
          previous: previousActors,
        },
        calendarMonth,
        currentServices,
        ownerMonetization,
        currentPeriod: {
          usage: currentUsageResult.status === "fulfilled" ? currentUsageResult.value : null,
          limits: limitsResult.status === "fulfilled" ? limitsResult.value : null,
        },
        unavailable,
        credentialIssue,
      };
      const usageCacheKey = `workspace:${session.businessProfileId ?? session.userId}:apify-usage:v4`;
      await Promise.all([
        cacheSet(usageCacheKey, value, 24 * 60 * 60),
        session.businessProfileId
          ? db.workspaceFinancialCache.upsert({
              where: { businessProfileId: session.businessProfileId },
              create: {
                businessProfileId: session.businessProfileId,
                payload: value as Prisma.InputJsonValue,
                syncedAt: now,
              },
              update: {
                payload: value as Prisma.InputJsonValue,
                syncedAt: now,
              },
            })
          : Promise.resolve(null),
      ]);
      return c.json({ ok: true, data: value });
    }),
  )

  .post("/usage/account-refresh", (c, next) => financialAccountRefreshHandler(c, next))
  .post("/costs/account-refresh", (c, next) => financialAccountRefreshHandler(c, next))
  .post("/revenue/account-refresh", (c, next) => financialAccountRefreshHandler(c, next))

  .post(
    "/usage-costs/sync",
    (financialActorSyncHandler = async (c) => {
      const session = c.get("session");
      await assertPlanFeature(session, "usage_analytics");
      assertApiKeyUnscoped(session);
      const requiresConsoleAccount =
        c.req.path.endsWith("/usage-costs/sync") || c.req.path.endsWith("/revenue/sync");
      if (requiresConsoleAccount) {
        const accountMatch = await validateUserApifyAccountMatch(
          session.userId,
          session.businessProfileId,
        );
        if (accountMatch.matches === false) {
          throw new AppError(
            "apify_account_mismatch",
            accountMatch.message ??
              "The Apify API key and Console publishing credentials belong to different accounts.",
            409,
          );
        }
      }
      const actors = await db.actor.findMany({
        where: { userId: session.userId, ...businessProfileScope(session) },
        select: { id: true },
      });
      if (actors.length === 0) {
        return c.json({ ok: true, data: { queued: 0, jobIds: [] } });
      }
      const { enqueue } = await import("../lib/queue.js");
      const jobIds = (
        await Promise.all(
          actors.map((actor) => enqueue("snapshots", { actorId: actor.id }).catch(() => null)),
        )
      ).filter((jobId): jobId is string => Boolean(jobId));
      if (jobIds.length === 0) {
        throw new AppError("queue_unavailable", "The Actor sync queue is not configured", 503);
      }
      return c.json({ ok: true, data: { queued: jobIds.length, jobIds } }, 202);
    }),
  )

  .post("/usage/sync", (c, next) => financialActorSyncHandler(c, next))
  .post("/costs/sync", (c, next) => financialActorSyncHandler(c, next))
  .post("/revenue/sync", (c, next) => financialActorSyncHandler(c, next))

  .get("/by-id/:id/runs/:runId", async (c) => {
    const session = c.get("session");
    const actor = await db.actor.findFirst({
      where: { id: c.req.param("id"), userId: session.userId, ...businessProfileScope(session) },
      select: { id: true, apifyActorId: true, title: true, username: true, actorName: true },
    });
    if (!actor) throw new AppError("not_found", "Actor not found", 404);
    assertApiKeyActorScope(session, actor.apifyActorId);
    const section = c.req.query("section") ?? "overview";
    if (!["overview", "logs", "dataset", "key-value-store"].includes(section)) {
      throw new AppError("invalid_query", "Unknown run section", 400);
    }
    const apify = await requireActorApiClient(session);
    const run = await apify.getRun(c.req.param("runId"));
    // A run ID is supplied by the browser. Verify its parent before reading
    // its private log or storage, even if the API token can access other runs.
    if (!run) {
      const snapshot = await db.actorRunSnapshot.findUnique({
        where: { actorId_apifyRunId: { actorId: actor.id, apifyRunId: c.req.param("runId") } },
      });
      if (!snapshot) throw new AppError("not_found", "Run not found for this Actor", 404);
      return c.json({
        ok: true,
        data: {
          actor,
          storageUnavailable: true,
          run: {
            id: snapshot.apifyRunId,
            actId: actor.apifyActorId,
            status: snapshot.status,
            startedAt: snapshot.startedAt,
            finishedAt: snapshot.finishedAt,
            buildId: snapshot.buildId,
            origin: snapshot.origin,
            usageTotalUsd:
              snapshot.usageCostUsd == null ? undefined : Number(snapshot.usageCostUsd),
          },
        },
      });
    }
    if (run.actId !== actor.apifyActorId) {
      throw new AppError("not_found", "Run not found for this Actor", 404);
    }

    const raw = apify.rawClient().run(run.id);
    if (section === "logs") {
      const log = (await raw.log().get()) ?? "";
      const maxLength = 200_000;
      return c.json({
        ok: true,
        data: { actor, run, log: log.slice(-maxLength), truncated: log.length > maxLength },
      });
    }
    if (section === "dataset") {
      const offset = Math.min(100_000, Math.max(0, Number(c.req.query("offset")) || 0));
      const limit = 20;
      const page = run.defaultDatasetId
        ? await raw.dataset().listItems({ offset, limit })
        : { items: [], total: 0 };
      return c.json({
        ok: true,
        data: { actor, run, dataset: { items: page.items, total: page.total, offset, limit } },
      });
    }
    if (section === "key-value-store") {
      const store = raw.keyValueStore();
      const cursor = c.req.query("cursor") || undefined;
      const keys = run.defaultKeyValueStoreId
        ? await store.listKeys({ limit: 50, ...(cursor ? { exclusiveStartKey: cursor } : {}) })
        : { items: [], isTruncated: false, nextExclusiveStartKey: undefined };
      const selectedKey = c.req.query("key");
      let record: {
        key: string;
        contentType: string | null;
        value: unknown;
        tooLarge: boolean;
      } | null = null;
      if (selectedKey && run.defaultKeyValueStoreId) {
        const matches = await store.listKeys({ prefix: selectedKey, limit: 1 });
        const metadata = matches.items.find((item) => item.key === selectedKey);
        if (!metadata) throw new AppError("not_found", "Record not found", 404);
        const tooLarge = metadata.size > 256_000;
        const fetched = tooLarge ? null : await store.getRecord(selectedKey);
        const contentType = fetched?.contentType ?? null;
        const readable = Boolean(contentType?.includes("json") || contentType?.startsWith("text/"));
        const value = readable ? (fetched?.value ?? null) : null;
        record = { key: selectedKey, contentType, value, tooLarge };
      }
      return c.json({
        ok: true,
        data: {
          actor,
          run,
          keyValueStore: {
            items: keys.items,
            isTruncated: keys.isTruncated,
            nextExclusiveStartKey: keys.nextExclusiveStartKey,
            record,
          },
        },
      });
    }
    if (section !== "overview") throw new AppError("invalid_query", "Unknown run section", 400);
    return c.json({ ok: true, data: { actor, run } });
  })

  .get("/by-id/:id", async (c) => {
    const session = c.get("session");
    const requestedTab = c.req.query("tab");
    const actorTab =
      requestedTab === "analytics" || requestedTab === "history" || requestedTab === "manage"
        ? requestedTab
        : "overview";
    const metricLimit = actorTab === "analytics" ? 120 : actorTab === "overview" ? 30 : 10;
    const actor = await db.actor.findFirst({
      where: { id: c.req.param("id"), userId: session.userId, ...businessProfileScope(session) },
      include: {
        ...(actorTab === "history"
          ? {
              copyVariants: { orderBy: { createdAt: "desc" }, take: 60 },
              pricingHistory: { orderBy: { changedAt: "desc" }, take: 6 },
            }
          : {}),
        snapshots: { orderBy: { capturedAt: "desc" }, take: metricLimit },
        ...(actorTab === "overview" || actorTab === "analytics"
          ? {
              insightSnapshots: {
                orderBy: { capturedOn: "desc" },
                take: metricLimit,
                // The raw Console response blobs can be very large. The Actor
                // page rebuilds its charts from normalized daily columns and
                // only needs these compact analytics payloads.
                select: {
                  id: true,
                  capturedOn: true,
                  capturedAt: true,
                  syncStatus: true,
                  totalRuns: true,
                  succeededRuns: true,
                  failedRuns: true,
                  abortedRuns: true,
                  timedOutRuns: true,
                  resultCount: true,
                  successRate: true,
                  activeUsers: true,
                  totalUsers: true,
                  uniqueStoreViewers: true,
                  consolePageViews: true,
                  usersWithRun: true,
                  costUsd: true,
                  revenueUsd: true,
                  profitUsd: true,
                  profitMargin: true,
                  qualityScore: true,
                  qualityPercentile: true,
                  acquisition: true,
                  monetization: true,
                  quality: true,
                },
              },
              usageDaily: { orderBy: { date: "desc" }, take: actorTab === "analytics" ? 120 : 30 },
            }
          : {}),
        runSnapshots: { orderBy: { startedAt: "desc" }, take: actorTab === "analytics" ? 100 : 10 },
        optimizationResults: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            runId: true,
            status: true,
            currentScore: true,
            proposedScore: true,
            improvementPoints: true,
            improvementPercent: true,
            createdAt: true,
          },
        },
        websiteIdentity: {
          select: {
            id: true,
            slug: true,
            name: true,
            canonicalDomain: true,
            currentLogo: { select: { id: true } },
          },
        },
        logoRecommendations: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, logoId: true, status: true, error: true },
        },
      },
    });
    if (!actor) throw new AppError("not_found", "Actor not found", 404);
    assertApiKeyActorScope(session, actor.apifyActorId);
    // The workspace Actor record intentionally contains private operational
    // state. Public Store metrics, ratings, price events, and daily Store
    // observations live in the catalog instead. Return that already-synced
    // record with the dashboard response so opening an Actor is fast and does
    // not discard public metadata after the first private sync.
    const storeCatalog = await db.storeActor.findUnique({
      where: { apifyActorId: actor.apifyActorId },
      select: {
        apifyActorId: true,
        isPublic: true,
        isDeprecated: true,
        apifyCreatedAt: true,
        firstPublishedAt: true,
        apifyModifiedAt: true,
        totalRuns: true,
        totalUsers: true,
        users7Days: true,
        users30Days: true,
        users90Days: true,
        runs30Days: true,
        reviewCount: true,
        reviewRating: true,
        bookmarkCount: true,
        categories: true,
        metaLabels: true,
        pricingInfos: true,
        firstSeenAt: true,
        lastSeenAt: true,
        detailsSyncedAt: true,
        snapshots: {
          orderBy: { capturedAt: "desc" },
          take: actorTab === "overview" || actorTab === "analytics" ? 60 : 10,
          select: {
            id: true,
            capturedAt: true,
            totalRuns: true,
            totalUsers: true,
            users30Days: true,
            runs30Days: true,
            reviewCount: true,
            reviewRating: true,
          },
        },
      },
    });
    const storedSnapshots = actor.snapshots ?? [];
    const storedInsightSnapshots = actor.insightSnapshots ?? [];
    const storedRunSnapshots = actor.runSnapshots ?? [];
    const hasStoredDetail = Boolean(
      actor.title ||
      actor.description ||
      actor.currentImageUrl ||
      storedSnapshots.length ||
      storedInsightSnapshots.length ||
      storedRunSnapshots.length,
    );
    const latestStoredAt = [
      storedSnapshots[0]?.capturedAt,
      storedInsightSnapshots[0]?.capturedOn,
      storedRunSnapshots[0]?.startedAt,
    ]
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())
      .at(0);
    const refreshDue =
      !latestStoredAt || Date.now() - latestStoredAt.getTime() >= ACTOR_DETAIL_REFRESH_MS;
    if (hasStoredDetail && refreshDue) {
      // One refresh job per Actor per 15-minute window prevents repeated page
      // visits from issuing parallel Apify requests or rate-limit bursts. It
      // is intentionally fire-and-forget so Redis health cannot delay the
      // cached detail response.
      void import("../lib/queue.js")
        .then(({ enqueue }) =>
          enqueue(
            "snapshots",
            { actorId: actor.id, bootstrapInsights: storedInsightSnapshots.length === 0 },
            {
              jobId: `actor-detail-refresh:${actor.id}:${Math.floor(Date.now() / ACTOR_DETAIL_REFRESH_MS)}`,
            },
          ),
        )
        .catch(() => null);
    }
    // Never fall back to live Apify calls during a page render. The worker
    // owns refreshes; the next navigation receives the synchronized DB copy.
    const apify = {
      actor: null,
      basicInfo: null,
      metricAnalytics: [],
      ownerAnalytics: [],
      quality: null,
      debugging: null,
      recentRuns: [],
    };
    return c.json({
      ok: true,
      data: {
        ...actor,
        copyVariants: actor.copyVariants ?? [],
        pricingHistory: actor.pricingHistory ?? [],
        insightSnapshots: actor.insightSnapshots ?? [],
        usageDaily: actor.usageDaily ?? [],
        runSnapshots: actor.runSnapshots ?? [],
        snapshots: actor.snapshots ?? [],
        optimizationResults: actor.optimizationResults ?? [],
        ...actorPictureFields(actor),
        apify,
        storeCatalog,
      },
    });
  })

  // Return the tracked actor plus live Apify metadata when the user has a
  // connected account. This is also the authenticated source used by MCP.
  .get("/available", async (c) => {
    const session = c.get("session");
    assertApiKeyUnscoped(session);
    const apify = await requireActorApiClient(session);

    const items = await listAllMyActors(apify);
    const tracked = await db.actor.findMany({
      where: {
        userId: session.userId,
        ...businessProfileScope(session),
        apifyActorId: { in: items.map((actor) => actor.id) },
      },
      select: { apifyActorId: true },
    });
    const trackedIds = new Set(tracked.map((actor) => actor.apifyActorId));
    return c.json({
      ok: true,
      data: items.map((actor) => ({ ...actor, tracked: trackedIds.has(actor.id) })),
    });
  })

  .get("/:apifyActorId", async (c) => {
    const session = c.get("session");
    assertApiKeyCapability(session, "actors:read");
    const apifyActorId = c.req.param("apifyActorId");
    assertApiKeyActorScope(session, apifyActorId);
    const actor = await db.actor.findFirst({
      where: { apifyActorId, userId: session.userId, ...businessProfileScope(session) },
      include: {
        copyVariants: { orderBy: { createdAt: "desc" }, take: 10 },
        pricingHistory: { orderBy: { changedAt: "desc" }, take: 10 },
        websiteIdentity: {
          select: {
            id: true,
            slug: true,
            name: true,
            canonicalDomain: true,
            currentLogo: { select: { id: true } },
          },
        },
        logoRecommendations: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, logoId: true, status: true, error: true },
        },
      },
    });
    if (!actor) throw new AppError("not_found", `Actor ${apifyActorId} not found`, 404);
    const synchronizedAt = [
      actor.lastOperationalSyncAt,
      actor.lastRunSyncAt,
      actor.storeStatusSyncedAt,
      actor.readinessSyncedAt,
      actor.updatedAt,
    ]
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    return c.json({
      ok: true,
      data: {
        actor: { ...actor, ...actorPictureFields(actor) },
        live: null,
        cached: true,
        synchronizedAt: synchronizedAt?.toISOString() ?? null,
      },
    });
  })

  // Sync the current actor list from Apify into our DB
  .post("/sync", async (c) => {
    const session = c.get("session");
    assertApiKeyCapability(session, "actors:sync");
    assertApiKeyUnscoped(session);
    const rate = await checkRateLimit(`actors:sync:${session.userId}`, { windowMs: 60000, max: 5 });
    if (!rate.allowed) {
      return c.json(
        {
          ok: false,
          error: { code: "rate_limited", message: "Too many syncs. Try again in a minute." },
        },
        429,
      );
    }
    const apify = await requireActorApiClient(session);

    const items = await listAllMyActors(apify);
    if (!session.businessProfileId)
      throw new AppError("workspace_required", "Select a workspace first", 409);
    const admission = await admitWorkspaceActors(session.userId, session.businessProfileId, items, {
      reconcile: true,
    });
    const syncItems = admission.items;
    const actorCountKey = `plan:actor-count:${session.userId}:${session.businessProfileId}`;
    const matchedActors = await db.actor.findMany({
      where: {
        userId: session.userId,
        ...businessProfileScope(session),
        apifyActorId: { in: syncItems.map((actor) => actor.id) },
      },
      select: {
        apifyActorId: true,
        userId: true,
        businessProfileId: true,
        websiteAdminOverride: true,
      },
    });
    const storeClassifications = await db.storeActor.findMany({
      where: { apifyActorId: { in: syncItems.map((actor) => actor.id) } },
      select: {
        apifyActorId: true,
        websiteIdentityId: true,
        websiteConfidence: true,
        websiteMethod: true,
        websiteEvidence: true,
        websiteClassifiedAt: true,
        websiteClassificationError: true,
      },
    });
    const storeClassificationByActor = new Map(
      storeClassifications.map((actor) => [actor.apifyActorId, actor]),
    );
    const existingByActor = new Map(matchedActors.map((actor) => [actor.apifyActorId, actor]));

    const upserts = await Promise.all(
      syncItems.map((a) => {
        const storeClassification = storeClassificationByActor.get(a.id);
        const preserveAdminOverride = existingByActor.get(a.id)?.websiteAdminOverride === true;
        const websiteClassification =
          storeClassification?.websiteIdentityId && !preserveAdminOverride
            ? {
                websiteIdentityId: storeClassification.websiteIdentityId,
                websiteConfidence: storeClassification.websiteConfidence,
                websiteMethod: storeClassification.websiteMethod,
                websiteEvidence:
                  (storeClassification.websiteEvidence as Prisma.InputJsonValue | null) ??
                  Prisma.DbNull,
                websiteClassifiedAt: storeClassification.websiteClassifiedAt,
                websiteClassificationError: storeClassification.websiteClassificationError,
              }
            : {};
        return db.actor.upsert({
          where: {
            businessProfileId_apifyActorId: {
              businessProfileId: session.businessProfileId!,
              apifyActorId: a.id,
            },
          },
          create: {
            userId: session.userId,
            businessProfileId: session.businessProfileId!,
            apifyActorId: a.id,
            username: a.username,
            actorName: a.name,
            title: a.title,
            description: a.description,
            currentImageUrl: a.pictureUrl,
            currentPricing: activePricingInfo(a.pricingInfos) as Prisma.InputJsonValue | undefined,
            ...(a.storeVisibilityAvailable ? { storeIsPublic: a.isPublic } : {}),
            ...(a.storeDeprecationAvailable ? { storeIsDeprecated: a.isDeprecated ?? false } : {}),
            ...(a.storeNoticeAvailable ? { storeNotice: a.notice ?? "NONE" } : {}),
            ...(a.storeStatusAvailable ? { storeStatusSyncedAt: new Date() } : {}),
            hasDescription: Boolean(a.description?.trim()),
            hasCategories: Boolean(a.categories?.length),
            ...websiteClassification,
          },
          update: {
            username: a.username,
            actorName: a.name,
            title: a.title,
            description: a.description,
            currentImageUrl: a.pictureUrl,
            currentPricing: activePricingInfo(a.pricingInfos) as Prisma.InputJsonValue | undefined,
            ...(a.storeVisibilityAvailable ? { storeIsPublic: a.isPublic } : {}),
            ...(a.storeDeprecationAvailable ? { storeIsDeprecated: a.isDeprecated ?? false } : {}),
            ...(a.storeNoticeAvailable ? { storeNotice: a.notice ?? "NONE" } : {}),
            ...(a.storeStatusAvailable ? { storeStatusSyncedAt: new Date() } : {}),
            hasDescription: Boolean(a.description?.trim()),
            hasCategories: Boolean(a.categories?.length),
            ...websiteClassification,
          },
        });
      }),
    );
    // Plan-limit cache key includes the actor count; an upsert that
    // adds a new actor must invalidate it.
    await cacheSet(actorCountKey, admission.trackedCount, 60);
    if (upserts.length > 0) {
      await db.onboardingState.updateMany({
        where: { userId: session.userId, ...businessProfileScope(session) },
        data: { actorImported: true },
      });
      const { enqueue } = await import("../lib/queue.js");
      await Promise.all(
        upserts.map((actor) =>
          enqueue("snapshots", { actorId: actor.id, bootstrapInsights: true }).catch(() => null),
        ),
      );
    }
    trackEvent("actors.synced", { userId: session.userId, properties: { count: upserts.length } });
    await recordUserAudit(c, session, "actors.sync", "actors", { count: upserts.length });
    return c.json({
      ok: true,
      data: {
        synced: upserts.length,
        created: admission.created,
        updated: upserts.length - admission.created,
        available: items.length,
        skipped: admission.skipped,
        plan: admission.plan,
        limit: admission.usage.actorLimit,
        usage: admission.usage,
      },
    });
  })

  // Update the Store title from the dashboard actor card. The client sends
  // the local DB id, but accepting the Apify id as well keeps this endpoint
  // useful to API/MCP callers and avoids coupling the UI to one identifier.
  .patch(
    "/:actorId",
    zValidator("json", z.object({ title: z.string().trim().min(1).max(200) })),
    async (c) => {
      const session = c.get("session");
      await assertPlanFeature(session, "ai_copy");
      const actorKey = c.req.param("actorId");
      const { title } = c.req.valid("json");
      const actorRow = await db.actor.findFirst({
        where: {
          userId: session.userId,
          ...businessProfileScope(session),
          OR: [{ id: actorKey }, { apifyActorId: actorKey }],
        },
      });
      if (!actorRow) throw new AppError("not_found", "Actor not found", 404);
      assertApiKeyActorScope(session, actorRow.apifyActorId);

      const apify = session.businessProfileId
        ? await getUserApifyClient(session.userId, session.businessProfileId)
        : await getUserApifyClient(session.userId);
      if (!apify) throw new AppError("apify_not_connected", "Connect Apify first", 400);
      const updated = await apify.updateActorMetadata(actorRow.apifyActorId, {
        title,
      });
      const saved = await db.actor.update({
        where: { id: actorRow.id },
        data: { title: updated.actor.title ?? title },
      });
      await recordUserAudit(c, session, "actor.rename", `actor:${actorRow.id}`, { title });
      return c.json({ ok: true, data: saved });
    },
  )

  // AI rewrite copy — returns 3 variants without publishing
  .post(
    "/:apifyActorId/rewrite-copy",
    zValidator("json", z.object({ apifyActorId: z.string().min(1).optional() }).optional()),
    async (c) => {
      const session = c.get("session");
      await assertPlanFeature(session, "ai_copy");
      await assertFeatureEnabled("kill_switch_ai_rewrite", session.userId);
      const apifyActorId = c.req.param("apifyActorId");
      assertApiKeyActorScope(session, apifyActorId);
      const actorRow = await requireOwnedActor(
        session.userId,
        apifyActorId,
        session.businessProfileId,
      );
      const apify = session.businessProfileId
        ? await getUserApifyClient(session.userId, session.businessProfileId)
        : await getUserApifyClient(session.userId);
      if (!apify) throw new AppError("apify_not_connected", "Connect Apify first", 400);

      const actor = await apify.getActor(apifyActorId);
      if (!actor) throw new AppError("not_found", `Actor ${apifyActorId} not found`, 404);
      const requestBody = c.req.valid("json");
      if (requestBody?.apifyActorId && requestBody.apifyActorId !== apifyActorId) {
        throw new AppError("invalid_request", "Request actor does not match the route", 400);
      }

      const title = actor.title ?? actor.name;
      const description = actor.description ?? "";
      const readme = actor.readme ?? null;
      const language = inferActorLanguage({ title, description, readme });
      const keywords = extractKeywords({ title, description, max: 8 });
      const seedKeywords =
        keywords.length > 0
          ? keywords
          : title
              .split(/\s+/)
              .filter((w) => w.length >= 3)
              .slice(0, 6);

      const variants = await rewriteActorCopy({
        actorTitle: title,
        actorDescription: description,
        sourceSummary: readme || description || title || actor.name,
        language,
        keywords: seedKeywords,
      });

      // Persist variants as historical records (inactive until user picks one)
      await db.$transaction([
        ...variants.flatMap((v) => [
          db.copyVariant.create({
            data: {
              actorId: actorRow.id,
              field: "title",
              value: v.title,
              generatedBy: "ai",
              promptContext: v as unknown as object,
            },
          }),
          db.copyVariant.create({
            data: {
              actorId: actorRow.id,
              field: "description",
              value: v.description,
              generatedBy: "ai",
              promptContext: v as unknown as object,
            },
          }),
          db.copyVariant.create({
            data: {
              actorId: actorRow.id,
              field: "seoTitle",
              value: v.seoTitle,
              generatedBy: "ai",
              promptContext: v as unknown as object,
            },
          }),
          db.copyVariant.create({
            data: {
              actorId: actorRow.id,
              field: "seoDescription",
              value: v.seoDescription,
              generatedBy: "ai",
              promptContext: v as unknown as object,
            },
          }),
        ]),
      ]);

      await recordUserAudit(c, session, "actor.copy.generated", `actor:${apifyActorId}`, {
        variantCount: variants.length,
        language,
        keywords: seedKeywords,
      });

      return c.json({ ok: true, data: { variants, keywords: seedKeywords, language } });
    },
  )

  // Update the chosen listing copy on Apify. Marketplace categories are
  // assigned and maintained by Apify and are intentionally excluded.
  .put(
    "/:apifyActorId/copy",
    zValidator(
      "json",
      updateActorCopySchema
        .omit({ apifyActorId: true, readme: true })
        .extend({ readme: z.never().optional() }),
    ),
    async (c) => {
      const session = c.get("session");
      await assertPlanFeature(session, "ai_copy");
      const apifyActorId = c.req.param("apifyActorId");
      assertApiKeyActorScope(session, apifyActorId);
      const actorRow = await requireOwnedActor(
        session.userId,
        apifyActorId,
        session.businessProfileId,
      );
      const body = c.req.valid("json");
      const apify = session.businessProfileId
        ? await getUserApifyClient(session.userId, session.businessProfileId)
        : await getUserApifyClient(session.userId);
      if (!apify) throw new AppError("apify_not_connected", "Connect Apify first", 400);

      const updated = Object.keys(body).length
        ? typeof apify.updateActorMetadata === "function"
          ? await apify.updateActorMetadata(apifyActorId, body).then((result) => result.actor)
          : await apify.updateActor(apifyActorId, body)
        : await apify.getActor(apifyActorId);
      if (!updated) throw new AppError("not_found", `Actor ${apifyActorId} not found`, 404);
      const currentCopy = { ...jsonRecord(actorRow.currentCopy), ...body };
      await db.actor.update({
        where: { id: actorRow.id },
        data: {
          title: updated.title ?? undefined,
          description: updated.description ?? undefined,
          ...(typeof body.description === "string" ? { hasDescription: true } : {}),
          readinessSyncedAt: new Date(),
          currentCopy: currentCopy as Prisma.InputJsonValue,
        },
      });
      for (const [field, value] of Object.entries(body)) {
        const storedValue = typeof value === "string" ? value : null;
        if (storedValue === null) continue;
        await db.copyVariant.updateMany({
          where: { actorId: actorRow.id, field, isActive: true },
          data: { isActive: false },
        });
        await db.copyVariant.create({
          data: {
            actorId: actorRow.id,
            field,
            value: storedValue,
            generatedBy: "user",
            isActive: true,
          },
        });
      }

      await recordUserAudit(c, session, "actor.copy.updated", `actor:${apifyActorId}`, body);
      return c.json({ ok: true, data: updated });
    },
  )

  // Categories are assigned by Apify. Owners can send correction feedback
  // through the same Console endpoint exposed by the current publication UI.
  .post(
    "/:apifyActorId/categories/feedback",
    zValidator("json", actorCategoryFeedbackSchema),
    async (c) => {
      const session = c.get("session");
      const apifyActorId = c.req.param("apifyActorId");
      assertApiKeyActorScope(session, apifyActorId);
      await requireOwnedActor(session.userId, apifyActorId, session.businessProfileId);
      const apify = session.businessProfileId
        ? await getUserApifyClient(session.userId, session.businessProfileId)
        : await getUserApifyClient(session.userId);
      if (!apify) throw new AppError("apify_not_connected", "Connect Apify first", 400);
      const result = await apify.submitActorCategoriesFeedback(
        apifyActorId,
        c.req.valid("json").details,
      );
      await recordUserAudit(
        c,
        session,
        "actor.categories.feedback-submitted",
        `actor:${apifyActorId}`,
      );
      return c.json({ ok: true, data: result });
    },
  )

  // Compare the actor with current public Store listings before a manual
  // pricing change. This is derived from live Apify data; it never writes a
  // price automatically and always returns the competitors used.
  .get("/:apifyActorId/pricing/recommendation", async (c) => {
    const session = c.get("session");
    await assertPlanFeature(session, "pricing_recommendations");
    await assertFeatureEnabled("pro_pricing_experiments", session.userId);
    const apifyActorId = c.req.param("apifyActorId");
    assertApiKeyActorScope(session, apifyActorId);
    await requireOwnedActor(session.userId, apifyActorId, session.businessProfileId);
    const apify = session.businessProfileId
      ? await getUserApifyClient(session.userId, session.businessProfileId)
      : await getUserApifyClient(session.userId);
    if (!apify) throw new AppError("apify_not_connected", "Connect Apify first", 400);
    const actor = await apify.getActor(apifyActorId);
    if (!actor) throw new AppError("not_found", `Actor ${apifyActorId} not found`, 404);

    const query = extractKeywords({
      title: actor.title ?? actor.name,
      description: actor.description ?? "",
      max: 5,
    }).join(" ");
    const searchQuery = query || actor.title || actor.name;
    const catalogApify = (await getAdminApifyClient()) ?? apify;
    const results = await catalogApify.searchStore({
      q: searchQuery,
      limit: 25,
      sortBy: "popularity",
    });
    const comparableResults = results.filter((item) => item.id !== apifyActorId).slice(0, 12);
    const competitorDetails = await Promise.all(
      comparableResults.map((item) => catalogApify.getActorBasicInfo(item.id).catch(() => null)),
    );
    const competitors = comparableResults.map((item, index) => {
      const detail = competitorDetails[index];
      const enrichedItem: ApifyStoreSearchResult = detail
        ? {
            ...item,
            stats: detail.stats ?? item.stats,
            reviewCount: detail.stats?.actorReviewCount ?? item.reviewCount,
            reviewRating: detail.stats?.actorReviewRating ?? item.reviewRating,
          }
        : item;
      return mapPricingCompetitor(enrichedItem, detail?.pricingInfos ?? item.pricingInfos);
    });
    const priced = competitors.filter(
      (item): item is typeof item & { amount: number } =>
        item.model === "PAY_PER_EVENT" && item.amount !== null,
    );
    const amounts = priced.map((item) => item.amount);
    const marketMedian = median(amounts);
    const currentBasicInfo = await apify.getActorBasicInfo(apifyActorId).catch(() => null);
    const currentPricing = priceFromInfo(
      activePricingInfo(currentBasicInfo?.pricingInfos ?? actor.pricingInfos),
    );
    const analyticsMonth = new Date().toISOString().slice(0, 7) + "-01";
    const analytics = await apify
      .getActorAnalytics([apifyActorId], analyticsMonth)
      .catch(() => null);
    const successfulRuns30Days =
      currentBasicInfo?.stats?.publicActorRunStats30Days?.SUCCEEDED ?? null;
    const totalRuns30Days = currentBasicInfo?.stats?.publicActorRunStats30Days?.TOTAL ?? null;
    const successRate30Days =
      successfulRuns30Days !== null && totalRuns30Days
        ? Number(((successfulRuns30Days / totalRuns30Days) * 100).toFixed(1))
        : null;

    await recordUserAudit(
      c,
      session,
      "actor.pricing.recommendation.read",
      `actor:${apifyActorId}`,
      {
        query: searchQuery,
        pricedCompetitorCount: priced.length,
      },
    );

    return c.json({
      ok: true,
      data: {
        query: searchQuery,
        currentPricing,
        recommendedAmount: marketMedian,
        marketMedian,
        marketRange: { low: percentile(amounts, 0.25), high: percentile(amounts, 0.75) },
        pricedCompetitorCount: priced.length,
        competitors,
        actorSignals: {
          users7Days: currentBasicInfo?.stats?.totalUsers7Days ?? null,
          users30Days: currentBasicInfo?.stats?.totalUsers30Days ?? null,
          users90Days: currentBasicInfo?.stats?.totalUsers90Days ?? null,
          successRate30Days,
          bookmarkCount: currentBasicInfo?.stats?.bookmarkCount ?? null,
          reviewCount: currentBasicInfo?.stats?.actorReviewCount ?? null,
          reviewRating: currentBasicInfo?.stats?.actorReviewRating ?? null,
        },
        ownerAnalytics: analytics,
        methodology:
          "Recommendation uses the median active primary event price from comparable live pay-per-event Store listings. The range is the observed 25th–75th percentile. One-time Actor start charges, future pricing periods, and legacy pricing models are excluded; owner cost, run, user, and margin analytics are returned separately so event semantics can be reviewed before publishing.",
      },
    });
  })

  .get(
    "/:apifyActorId/analytics",
    zValidator(
      "query",
      z.object({
        month: z
          .string()
          .regex(/^\d{4}-\d{2}-01$/)
          .optional(),
      }),
    ),
    async (c) => {
      const session = c.get("session");
      const apifyActorId = c.req.param("apifyActorId");
      assertApiKeyActorScope(session, apifyActorId);
      await requireOwnedActor(session.userId, apifyActorId, session.businessProfileId);
      const apify = session.businessProfileId
        ? await getUserApifyClient(session.userId, session.businessProfileId)
        : await getUserApifyClient(session.userId);
      if (!apify) throw new AppError("apify_not_connected", "Connect Apify first", 400);
      const month = c.req.valid("query").month ?? new Date().toISOString().slice(0, 7) + "-01";
      const analytics = await apify.getActorAnalytics([apifyActorId], month);
      return c.json({ ok: true, data: analytics });
    },
  )

  // MCP pricing reads use pricing:read without requiring actors:read.
  .get("/:apifyActorId/pricing", async (c) => {
    const session = c.get("session");
    const apifyActorId = c.req.param("apifyActorId");
    assertApiKeyActorScope(session, apifyActorId);
    const actor = await db.actor.findFirst({
      where: { apifyActorId, userId: session.userId, ...businessProfileScope(session) },
      select: { apifyActorId: true, currentPricing: true, updatedAt: true },
    });
    if (!actor) throw new AppError("not_found", `Actor ${apifyActorId} not found`, 404);
    return c.json({
      ok: true,
      data: {
        apifyActorId: actor.apifyActorId,
        pricing: actor.currentPricing,
        synchronizedAt: actor.updatedAt,
      },
    });
  })
  .get(
    "/:apifyActorId/pricing/history",
    zValidator("query", z.object({ limit: z.coerce.number().int().min(1).max(180).default(60) })),
    async (c) => {
      const session = c.get("session");
      const apifyActorId = c.req.param("apifyActorId");
      assertApiKeyActorScope(session, apifyActorId);
      const { limit } = c.req.valid("query");
      const actor = await db.actor.findFirst({
        where: { apifyActorId, userId: session.userId, ...businessProfileScope(session) },
        select: {
          apifyActorId: true,
          pricingHistory: { orderBy: { changedAt: "desc" }, take: limit },
        },
      });
      if (!actor) throw new AppError("not_found", `Actor ${apifyActorId} not found`, 404);
      return c.json({ ok: true, data: { apifyActorId, pricing: actor.pricingHistory } });
    },
  )

  // Update pricing on the actor
  .put(
    "/:apifyActorId/pricing",
    zValidator(
      "json",
      z.object({
        pricing: actorPricingSchema,
        reason: z.string().optional(),
      }),
    ),
    async (c) => {
      const session = c.get("session");
      await assertPlanFeature(session, "pricing_management");
      const apifyActorId = c.req.param("apifyActorId");
      assertApiKeyActorScope(session, apifyActorId);
      const actorRow = await requireOwnedActor(
        session.userId,
        apifyActorId,
        session.businessProfileId,
      );
      const { pricing, reason } = c.req.valid("json");
      const apify = session.businessProfileId
        ? await getUserApifyClient(session.userId, session.businessProfileId)
        : await getUserApifyClient(session.userId);
      if (!apify) throw new AppError("apify_not_connected", "Connect Apify first", 400);

      const pricingUpdate = await apify.appendActorPricing(apifyActorId, {
        pricingModel: "PAY_PER_EVENT",
        minimalMaxTotalChargeUsd: 0.5,
        isPPEPlatformUsagePaidByUser: true,
        isPriceChangeNotificationSuppressed: false,
        apifyMarginPercentage: 0.2,
        reasonForChange: reason?.trim() || "Updated pay-per-event pricing in ActorConsole",
        pricingPerEvent: { actorChargeEvents: pricing.events },
      });
      const updated = pricingUpdate.actor;

      await db.$transaction([
        db.actor.update({
          where: { id: actorRow.id },
          data: {
            currentPricing: {
              ...pricing,
              ...(pricingUpdate.startedAt ? { startedAt: pricingUpdate.startedAt } : {}),
            } as any,
          },
        }),
        ...(pricingUpdate.changed
          ? [
              db.pricingHistory.create({
                data: {
                  actorId: actorRow.id,
                  model: pricing.model,
                  amount: pricing.amount,
                  currency: "USD",
                  payload: {
                    ...pricing,
                    ...(pricingUpdate.startedAt ? { startedAt: pricingUpdate.startedAt } : {}),
                  } as any,
                  changedBy: "user",
                  reason,
                },
              }),
            ]
          : []),
      ]);

      await recordUserAudit(c, session, "actor.pricing.updated", `actor:${apifyActorId}`, pricing);
      return c.json({
        ok: true,
        data: {
          pricing,
          updated: updated.pricingInfos ?? null,
          changed: pricingUpdate.changed,
          startedAt: pricingUpdate.startedAt ?? null,
        },
      });
    },
  )

  // GET /actors/:apifyActorId/snapshots — recent snapshot history
  .get("/:apifyActorId/snapshots", async (c) => {
    const session = c.get("session");
    const apifyActorId = c.req.param("apifyActorId");
    assertApiKeyActorScope(session, apifyActorId);
    const actor = await db.actor.findFirst({
      where: { apifyActorId, userId: session.userId, ...businessProfileScope(session) },
    });
    if (
      !actor ||
      actor.userId !== session.userId ||
      (session.businessProfileId && actor.businessProfileId !== session.businessProfileId)
    ) {
      return c.json({ ok: false, error: { code: "not_found" } }, 404);
    }
    const snapshots = await db.actorSnapshot.findMany({
      where: { actorId: actor.id },
      orderBy: { capturedAt: "desc" },
      take: 60,
    });
    return c.json({ ok: true, data: snapshots });
  })

  .get(
    "/:apifyActorId/usage",
    zValidator("query", z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })),
    async (c) => {
      const session = c.get("session");
      await assertPlanFeature(session, "usage_analytics");
      const apifyActorId = c.req.param("apifyActorId");
      assertApiKeyActorScope(session, apifyActorId);
      const { days } = c.req.valid("query");
      const actor = await db.actor.findFirst({
        where: { apifyActorId, userId: session.userId, ...businessProfileScope(session) },
        select: { id: true },
      });
      if (!actor) throw new AppError("not_found", `Actor ${apifyActorId} not found`, 404);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const daily = await db.usageDaily.findMany({
        where: { actorId: actor.id, date: { gte: since } },
        orderBy: { date: "asc" },
      });
      const totalUsageCostUsd = daily.reduce((sum, item) => sum + Number(item.usageCostUsd), 0);
      const totalRuns = daily.reduce((sum, item) => sum + item.runs, 0);
      const successfulRuns = daily.reduce((sum, item) => sum + item.successfulRuns, 0);
      const failedRuns = daily.reduce((sum, item) => sum + item.failedRuns, 0);
      const abortedRuns = daily.reduce((sum, item) => sum + item.abortedRuns, 0);
      const timedOutRuns = daily.reduce((sum, item) => sum + item.timedOutRuns, 0);
      const resultCount = daily.reduce((sum, item) => sum + item.resultCount, 0);
      const granularity = c.req.query("granularity") === "month" ? "month" : "day";
      const mode = c.req.query("mode") === "cumulative" ? "cumulative" : "absolute";
      const grouped = new Map<
        string,
        { usageCostUsd: number; runs: number; successfulRuns: number; failedRuns: number }
      >();
      for (const item of daily) {
        const day = item.date.toISOString().slice(0, 10);
        const period = granularity === "day" ? day : day.slice(0, 7);
        const point = grouped.get(period) ?? {
          usageCostUsd: 0,
          runs: 0,
          successfulRuns: 0,
          failedRuns: 0,
        };
        point.usageCostUsd += Number(item.usageCostUsd);
        point.runs += item.runs;
        point.successfulRuns += item.successfulRuns;
        point.failedRuns += item.failedRuns;
        grouped.set(period, point);
      }
      let cumulativeCost = 0;
      let cumulativeRuns = 0;
      const report = [...grouped]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([period, point]) => {
          cumulativeCost += point.usageCostUsd;
          cumulativeRuns += point.runs;
          return {
            period,
            ...point,
            ...(mode === "cumulative"
              ? { usageCostUsd: cumulativeCost, runs: cumulativeRuns }
              : {}),
          };
        });
      return c.json({
        ok: true,
        data: {
          apifyActorId,
          windowDays: days,
          totalRuns,
          successfulRuns,
          failedRuns,
          abortedRuns,
          timedOutRuns,
          resultCount,
          usageCostUsd: Number(totalUsageCostUsd.toFixed(2)),
          daily,
          report: { granularity, mode, points: report },
          accountingNote:
            "Usage cost is the connected Apify account's platform expense, not creator revenue.",
        },
      });
    },
  )

  // Also track analytics events for the admin overview endpoint
  .get("/analytics/events", async (c) => {
    const session = c.get("session");
    const limit = limitQuery(c.req.query("limit"), 50, 200);
    const name = stringQuery(c.req.query("name"), "name", 100);
    const where: any = { userId: session.userId };
    if (name) where.name = name;
    const items = await db.analyticsEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return c.json({ ok: true, data: items });
  });

export { activePricingInfo, priceFromInfo };
