import Link from "next/link";
import { notFound } from "next/navigation";
import { authenticatedServerFetch } from "@/lib/server-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ExternalLink,
  Sparkles,
  TrendingUp,
  Users,
  PlayCircle,
  Tag,
  BarChart3,
  History,
  Settings2,
  CheckCircle2,
  Database,
  XCircle,
  Bookmark,
  CalendarDays,
  ChevronDown,
  Star,
} from "lucide-react";
import { ActorActions } from "@/components/dashboard/actor-actions";
import { ActorMetricCharts } from "@/components/dashboard/actor-metric-charts";
import {
  ActorQualityPanel,
  ActorRevenuePerformance,
} from "@/components/dashboard/actor-owner-analytics";
import { persistedOwnerAnalyticsFromSnapshots } from "@/components/dashboard/actor-owner-analytics-data";
import { ActorInsightsHistory } from "@/components/dashboard/actor-insights-history";
import { CopyVariantHistory } from "@/components/dashboard/copy-variant-history";
import { DashboardPageHeader, DashboardUrlTabs } from "@/components/dashboard/dashboard-workbench";

interface ActorUsageMetricDay {
  date: string;
  runs: number;
  successfulRuns: number;
  failedRuns: number;
  abortedRuns: number;
  timedOutRuns: number;
  resultCount: number;
  usageCostUsd: string | number;
}

interface ActorPricingEvent {
  eventTitle?: string;
  eventDescription?: string;
  eventPriceUsd?: number;
  isPrimaryEvent?: boolean;
  isOneTimeEvent?: boolean;
  eventTieredPricingUsd?: Record<string, { tieredEventPriceUsd?: number }>;
}

interface ActorPricingPeriod {
  pricingModel?: string;
  pricePerUnitUsd?: number;
  unitName?: string;
  trialMinutes?: number;
  startedAt?: string;
  pricingPerEvent?: { actorChargeEvents?: Record<string, ActorPricingEvent> };
}

function currentPricingPeriod(value: unknown): ActorPricingPeriod | null {
  const periods = (Array.isArray(value) ? value : value ? [value] : []).filter(
    (item): item is ActorPricingPeriod => Boolean(item && typeof item === "object"),
  );
  const now = Date.now();
  const effective = periods.filter((period) => {
    if (!period.startedAt) return true;
    const startsAt = Date.parse(period.startedAt);
    return Number.isFinite(startsAt) && startsAt <= now;
  });
  return (
    [...(effective.length ? effective : periods)]
      .sort((left, right) => {
        const leftTime = left.startedAt ? Date.parse(left.startedAt) : 0;
        const rightTime = right.startedAt ? Date.parse(right.startedAt) : 0;
        return (
          (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0)
        );
      })
      .at(-1) ?? null
  );
}

function pricingEventPrice(event: ActorPricingEvent) {
  return event.eventPriceUsd ?? event.eventTieredPricingUsd?.FREE?.tieredEventPriceUsd ?? null;
}

function pricingHistoryEvents(value: unknown): Array<[string, ActorPricingEvent]> {
  if (!value || typeof value !== "object") return [];
  const events = (value as { events?: unknown }).events;
  if (!events || typeof events !== "object" || Array.isArray(events)) return [];
  return Object.entries(events as Record<string, ActorPricingEvent>);
}

export default async function ActorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const requestedTab = (await searchParams).tab;
  const activeTab =
    requestedTab === "analytics" || requestedTab === "performance" || requestedTab === "insights"
      ? "analytics"
      : requestedTab === "history"
        ? "history"
        : requestedTab === "manage" || requestedTab === "actions"
          ? "manage"
          : "overview";
  const response = await authenticatedServerFetch(
    `/actors/by-id/${encodeURIComponent(id)}?tab=${encodeURIComponent(activeTab)}`,
  );
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Could not load actor from the API");
  const responseBody = await response.json();
  const actor = responseBody.data;
  const apifyActor = actor.apify?.actor ?? null;
  const basicInfo = actor.apify?.basicInfo ?? null;
  const storeCatalog = actor.storeCatalog ?? null;
  // Public catalog observations are shared across ActorConsole. Combining
  // them with workspace snapshots gives dashboard charts the same real daily
  // history shown on the public Actor page, without delaying the page for a
  // fresh Apify request.
  const metricSnapshots = [
    ...actor.snapshots,
    ...(storeCatalog?.snapshots ?? []).map(
      (snapshot: {
        id: string;
        capturedAt: string;
        runs30Days: number | null;
        totalUsers: number | null;
        users30Days: number | null;
      }) => ({
        id: `store-${snapshot.id}`,
        capturedAt: snapshot.capturedAt,
        runs30d: snapshot.runs30Days,
        usersTotal: snapshot.totalUsers,
        monthlyUsers: snapshot.users30Days,
      }),
    ),
  ];
  const insightSnapshots = actor.insightSnapshots ?? [];
  const hasPersistedMetrics = insightSnapshots.some(
    (item: { totalRuns: number | null; activeUsers: number | null; totalUsers: number | null }) =>
      item.totalRuns != null || item.activeUsers != null || item.totalUsers != null,
  );
  const persistedMetricAnalytics = hasPersistedMetrics
    ? [
        {
          runStatistics: {
            dailyStats: Object.fromEntries(
              insightSnapshots.map(
                (item: {
                  capturedOn: string;
                  totalRuns: number | null;
                  succeededRuns: number | null;
                  failedRuns: number | null;
                  abortedRuns: number | null;
                  timedOutRuns: number | null;
                  resultCount: number | null;
                }) => [
                  new Date(item.capturedOn).toISOString().slice(0, 10),
                  {
                    TOTAL: item.totalRuns ?? undefined,
                    SUCCEEDED: item.succeededRuns ?? undefined,
                    FAILED: item.failedRuns ?? undefined,
                    ABORTED: item.abortedRuns ?? undefined,
                    "TIMED-OUT": item.timedOutRuns ?? undefined,
                    RESULTS: item.resultCount ?? undefined,
                  },
                ],
              ),
            ),
          },
          userCountStatistics: {
            values: insightSnapshots.map(
              (item: {
                capturedOn: string;
                activeUsers: number | null;
                totalUsers: number | null;
              }) => ({
                date: item.capturedOn,
                activeUsers: item.activeUsers,
                totalUsers: item.totalUsers,
              }),
            ),
          },
        },
      ]
    : [];
  const persistedOwnerAnalytics = persistedOwnerAnalyticsFromSnapshots(insightSnapshots);
  const metricAnalytics = actor.apify?.metricAnalytics?.length
    ? actor.apify.metricAnalytics
    : persistedMetricAnalytics;
  const ownerAnalytics = actor.apify?.ownerAnalytics?.length
    ? actor.apify.ownerAnalytics
    : persistedOwnerAnalytics;
  const actorQuality = actor.apify?.quality ?? insightSnapshots[0]?.quality ?? null;
  const latestSavedQuality = insightSnapshots.find(
    (item: { qualityScore?: number | null }) => item.qualityScore != null,
  );
  const recentRuns =
    actor.runSnapshots.length > 0 ? actor.runSnapshots : (actor.apify?.recentRuns ?? []);
  const snapshots = [...actor.snapshots].reverse();
  const latestSnapshot = snapshots.at(-1) ?? null;
  const analyticsUsageDaily: ActorUsageMetricDay[] = metricAnalytics.flatMap(
    (analytics: {
      runStatistics?: {
        dailyStats?: Record<
          string,
          {
            TOTAL?: number;
            SUCCEEDED?: number;
            FAILED?: number;
            ABORTED?: number;
            "TIMED-OUT"?: number;
            RESULTS?: number;
          }
        >;
      };
    }) =>
      Object.entries(analytics.runStatistics?.dailyStats ?? {}).map(([date, stats]) => ({
        date,
        runs: stats.TOTAL ?? 0,
        successfulRuns: stats.SUCCEEDED ?? 0,
        failedRuns: stats.FAILED ?? 0,
        abortedRuns: stats.ABORTED ?? 0,
        timedOutRuns: stats["TIMED-OUT"] ?? 0,
        resultCount: stats.RESULTS ?? 0,
        usageCostUsd: 0,
      })),
  );
  const usageByDate = new Map<string, ActorUsageMetricDay>(
    analyticsUsageDaily.map((day) => [new Date(day.date).toISOString().slice(0, 10), day]),
  );
  for (const day of actor.usageDaily as ActorUsageMetricDay[]) {
    const date = new Date(day.date).toISOString().slice(0, 10);
    const consoleDay = usageByDate.get(date);
    usageByDate.set(date, {
      ...day,
      ...consoleDay,
      usageCostUsd: day.usageCostUsd,
    });
  }
  const runDays = new Map<string, ActorUsageMetricDay>();
  for (const run of recentRuns as Array<{
    startedAt: string;
    status: string;
    resultCount?: number | null;
    usageCostUsd?: string | number | null;
    usageTotalUsd?: number | null;
  }>) {
    const startedAt = new Date(run.startedAt);
    if (Number.isNaN(startedAt.getTime())) continue;
    const date = startedAt.toISOString().slice(0, 10);
    const current = runDays.get(date) ?? {
      date,
      runs: 0,
      successfulRuns: 0,
      failedRuns: 0,
      abortedRuns: 0,
      timedOutRuns: 0,
      resultCount: 0,
      usageCostUsd: 0,
    };
    const status = run.status.toUpperCase();
    current.runs += 1;
    if (status === "SUCCEEDED") current.successfulRuns += 1;
    else if (status === "FAILED") current.failedRuns += 1;
    else if (status === "ABORTED") current.abortedRuns += 1;
    else if (status === "TIMED-OUT") current.timedOutRuns += 1;
    current.resultCount += run.resultCount ?? 0;
    current.usageCostUsd =
      Number(current.usageCostUsd) + Number(run.usageCostUsd ?? run.usageTotalUsd ?? 0);
    runDays.set(date, current);
  }
  for (const [date, runDay] of runDays) {
    const existing = usageByDate.get(date);
    if (!existing) {
      usageByDate.set(date, runDay);
      continue;
    }
    const existingDetailedRuns =
      existing.successfulRuns + existing.failedRuns + existing.abortedRuns + existing.timedOutRuns;
    usageByDate.set(date, {
      ...existing,
      ...(existingDetailedRuns === 0
        ? {
            successfulRuns: runDay.successfulRuns,
            failedRuns: runDay.failedRuns,
            abortedRuns: runDay.abortedRuns,
            timedOutRuns: runDay.timedOutRuns,
            resultCount: Math.max(existing.resultCount, runDay.resultCount),
          }
        : {}),
      usageCostUsd: Math.max(Number(existing.usageCostUsd), Number(runDay.usageCostUsd)),
    });
  }
  const usageDaily = Array.from(usageByDate.values()).sort(
    (left, right) => Date.parse(left.date) - Date.parse(right.date),
  );
  const hasPrivateUsageCost = actor.usageDaily.length > 0;
  const operationalTotals = usageDaily.reduce(
    (
      total: {
        runs: number;
        successfulRuns: number;
        failedRuns: number;
        abortedRuns: number;
        timedOutRuns: number;
        resultCount: number;
        usageCostUsd: number;
      },
      day: {
        runs: number;
        successfulRuns: number;
        failedRuns: number;
        abortedRuns: number;
        timedOutRuns: number;
        resultCount: number;
        usageCostUsd: string | number;
      },
    ) => ({
      runs: total.runs + day.runs,
      successfulRuns: total.successfulRuns + day.successfulRuns,
      failedRuns: total.failedRuns + day.failedRuns,
      abortedRuns: total.abortedRuns + day.abortedRuns,
      timedOutRuns: total.timedOutRuns + day.timedOutRuns,
      resultCount: total.resultCount + day.resultCount,
      usageCostUsd: total.usageCostUsd + Number(day.usageCostUsd),
    }),
    {
      runs: 0,
      successfulRuns: 0,
      failedRuns: 0,
      abortedRuns: 0,
      timedOutRuns: 0,
      resultCount: 0,
      usageCostUsd: 0,
    },
  );
  const completedRuns =
    operationalTotals.successfulRuns +
    operationalTotals.failedRuns +
    operationalTotals.abortedRuns +
    operationalTotals.timedOutRuns;
  const successRate = completedRuns
    ? Math.round((operationalTotals.successfulRuns / completedRuns) * 100)
    : 0;

  const actorStats = basicInfo?.stats ?? apifyActor?.stats ?? {};
  const storeRuns30d = Number(
    actorStats.publicActorRunStats30Days?.TOTAL ??
      storeCatalog?.runs30Days ??
      latestSnapshot?.runs30d ??
      0,
  );
  const storeTotalUsers = Number(
    actorStats.totalUsers ?? storeCatalog?.totalUsers ?? latestSnapshot?.usersTotal ?? 0,
  );
  const storeActiveUsers = Number(
    actorStats.totalUsers30Days ??
      actorStats.monthlyUsers ??
      storeCatalog?.users30Days ??
      latestSnapshot?.monthlyUsers ??
      0,
  );
  const storeRating =
    actorStats.actorReviewRating ?? actorStats.rating ?? storeCatalog?.reviewRating ?? null;
  const storeReviewCount = actorStats.actorReviewCount ?? storeCatalog?.reviewCount ?? null;
  const storeBookmarkCount = actorStats.bookmarkCount ?? storeCatalog?.bookmarkCount ?? null;
  const actorTitle = basicInfo?.title ?? apifyActor?.title ?? actor.title ?? actor.actorName;
  const actorDescription =
    basicInfo?.description ?? apifyActor?.description ?? actor.description ?? null;
  const actorImageUrl =
    basicInfo?.pictureUrl ??
    apifyActor?.pictureUrl ??
    actor.effectivePictureUrl ??
    actor.currentImageUrl;
  const actorPricing =
    currentPricingPeriod(basicInfo?.pricingInfos) ??
    currentPricingPeriod(apifyActor?.pricingInfos) ??
    currentPricingPeriod(storeCatalog?.pricingInfos) ??
    currentPricingPeriod(actor.currentPricing);
  const actorPricingEvents = Object.entries(actorPricing?.pricingPerEvent?.actorChargeEvents ?? {});
  const actorCategories =
    basicInfo?.categories ?? apifyActor?.categories ?? storeCatalog?.categories ?? [];
  const actorMetaLabelsRaw = Array.isArray(basicInfo?.metaLabels)
    ? basicInfo.metaLabels
    : Array.isArray(storeCatalog?.metaLabels)
      ? storeCatalog.metaLabels
      : [];
  const actorMetaLabels = actorMetaLabelsRaw
    .map((label: unknown) =>
      typeof label === "string"
        ? { name: label }
        : label && typeof label === "object"
          ? (label as { _id?: string; name?: string; type?: string; value?: string })
          : null,
    )
    .filter(
      (
        label: { _id?: string; name?: string; type?: string; value?: string } | null,
      ): label is { _id?: string; name?: string; type?: string; value?: string } => Boolean(label),
    );
  const ownerName =
    basicInfo?.publicOwnerProfile?.displayName ?? basicInfo?.publicOwnerProfile?.name ?? null;
  const actorFullName = `${actor.username}/${actor.actorName}`;
  const latestOptimization = actor.optimizationResults?.[0] ?? null;
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context={`Actors / ${actorFullName}`}
        secondaryActions={[
          {
            label: "SEO audit",
            href: `/dashboard/tools/seo?actor=${encodeURIComponent(actorFullName)}`,
          },
        ]}
        title={actorTitle}
        description={`${actorFullName}${ownerName ? ` · by ${ownerName}` : ""}`}
        breadcrumbs={[
          { label: "Workspace", href: "/dashboard" },
          { label: "Actors", href: "/dashboard/actors" },
          { label: actorTitle },
        ]}
        status={
          actorCategories[0] ? (
            <Badge variant="outline" className="shrink-0">
              <Tag className="mr-1 h-3 w-3" />
              {actorCategories[0]}
            </Badge>
          ) : undefined
        }
        primaryAction={
          <Button variant="signal" size="sm" className="w-full sm:w-auto" asChild>
            <a
              href={apifyActor?.url ?? `https://apify.com/${actor.username}/${actor.actorName}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View on Apify
            </a>
          </Button>
        }
      />

      {/* ── Stat tiles (always visible above tabs) ── */}
      {(Object.keys(actorStats).length > 0 || latestSnapshot) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={PlayCircle}
            label="30-day runs"
            value={(storeRuns30d || operationalTotals.runs).toLocaleString("en-IN")}
          />
          <StatTile
            icon={Users}
            label="Total users"
            value={storeTotalUsers.toLocaleString("en-IN")}
          />
          <StatTile
            icon={TrendingUp}
            label="Active users"
            value={storeActiveUsers.toLocaleString("en-IN")}
          />
          <StatTile
            icon={Sparkles}
            label="Last run"
            value={
              recentRuns[0]?.startedAt
                ? new Date(recentRuns[0].startedAt).toLocaleDateString("en-IN", {
                    month: "short",
                    day: "numeric",
                  })
                : "—"
            }
          />
        </div>
      )}

      {(actorPricing || storeCatalog || storeRating != null || storeBookmarkCount != null) && (
        <details className="group">
          <summary className="border-border bg-card hover:bg-muted/30 focus-visible:ring-ring flex cursor-pointer list-none items-center justify-between rounded-md border px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
            Pricing and Apify Store details{" "}
            <ChevronDown className="text-muted-foreground h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-4 space-y-4">
            {/* ── Pricing info card ── */}
            {actorPricing && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Live Apify pricing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="outline">{actorPricing.pricingModel ?? "UNKNOWN"}</Badge>
                    {actorPricing.pricePerUnitUsd != null && (
                      <span className="font-mono">
                        ${actorPricing.pricePerUnitUsd} / {actorPricing.unitName ?? "unit"}
                      </span>
                    )}
                    {actorPricing.trialMinutes != null && actorPricing.trialMinutes > 0 && (
                      <span className="text-muted-foreground">
                        {actorPricing.trialMinutes}-minute trial
                      </span>
                    )}
                    {recentRuns[0] && (
                      <span className="text-muted-foreground ml-auto text-xs">
                        Latest run: {recentRuns[0].status} ·{" "}
                        {new Date(recentRuns[0].startedAt).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    )}
                  </div>
                  {actorPricingEvents.length > 0 && (
                    <div className="border-border grid gap-px overflow-hidden border sm:grid-cols-2">
                      {actorPricingEvents.map(([eventName, event]) => {
                        const price = pricingEventPrice(event);
                        return (
                          <div key={eventName} className="bg-card p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold">{event.eventTitle ?? eventName}</p>
                                <p className="text-muted-foreground mt-1 break-all font-mono text-[10px]">
                                  {eventName}
                                </p>
                              </div>
                              <span className="font-mono font-semibold tabular-nums">
                                {price == null ? "Price unavailable" : `$${price.toFixed(6)}`}
                              </span>
                            </div>
                            {event.eventDescription && (
                              <p className="text-muted-foreground mt-3 text-xs leading-5">
                                {event.eventDescription}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {(storeCatalog || storeRating != null || storeBookmarkCount != null) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Apify Store profile</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <StoreMetric
                      icon={Star}
                      label="Rating"
                      value={storeRating == null ? "—" : `${storeRating.toFixed(1)} / 5`}
                      detail={
                        storeReviewCount == null
                          ? "Reviews syncing"
                          : `${storeReviewCount.toLocaleString()} reviews`
                      }
                    />
                    <StoreMetric
                      icon={Bookmark}
                      label="Bookmarks"
                      value={
                        storeBookmarkCount == null
                          ? "—"
                          : storeBookmarkCount.toLocaleString("en-IN")
                      }
                      detail="Public Store saves"
                    />
                    <StoreMetric
                      icon={CalendarDays}
                      label="Store state"
                      value={storeCatalog?.isPublic === false ? "Private" : "Published"}
                      detail={storeCatalog?.isDeprecated ? "Deprecated" : "Current listing"}
                    />
                  </div>
                  <dl className="border-border grid gap-x-6 gap-y-3 border-t pt-4 text-sm sm:grid-cols-2 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                    <CatalogRecord label="First published" value={storeCatalog?.firstPublishedAt} />
                    <CatalogRecord label="Actor created" value={storeCatalog?.apifyCreatedAt} />
                    <CatalogRecord label="Store modified" value={storeCatalog?.apifyModifiedAt} />
                    <CatalogRecord label="First observed" value={storeCatalog?.firstSeenAt} />
                    <CatalogRecord label="Last observed" value={storeCatalog?.lastSeenAt} />
                    <CatalogRecord label="Details synced" value={storeCatalog?.detailsSyncedAt} />
                  </dl>
                </CardContent>
              </Card>
            )}
          </div>
        </details>
      )}

      {/* ── Tabbed content ── */}
      <DashboardUrlTabs value={activeTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <TrendingUp className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="manage">
            <Settings2 className="h-4 w-4" />
            Manage
          </TabsTrigger>
        </TabsList>

        {/* ── Overview tab ── */}
        <TabsContent value="overview" className="space-y-6">
          <ActorQualityPanel
            quality={actorQuality}
            snapshotScore={latestSavedQuality?.qualityScore}
            snapshotPercentile={latestSavedQuality?.qualityPercentile}
          />
          <ActorMetricCharts
            snapshots={metricSnapshots}
            usageDaily={usageDaily}
            metricAnalytics={metricAnalytics}
          />
        </TabsContent>

        {/* ── Analytics tab ── */}
        <TabsContent value="analytics" className="space-y-6">
          <ActorRevenuePerformance analytics={ownerAnalytics} />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Actor activity</CardTitle>
            </CardHeader>
            <CardContent>
              {usageDaily.length === 0 ? (
                storeRuns30d > 0 || storeActiveUsers > 0 || storeTotalUsers > 0 ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricTile
                        icon={PlayCircle}
                        label="Store 30-day runs"
                        value={storeRuns30d}
                      />
                      <MetricTile icon={TrendingUp} label="Active users" value={storeActiveUsers} />
                      <MetricTile icon={Users} label="Total users" value={storeTotalUsers} />
                      <MetricTile
                        icon={BarChart3}
                        label="Private run details"
                        value="Sync pending"
                      />
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Store totals are available now. Daily statuses, results, and private usage
                      cost will appear after the background run-history sync completes.
                    </p>
                  </div>
                ) : (
                  <EmptyState
                    title="Not enough data yet"
                    description="Run, failure, result, and usage metrics appear after your Apify account finishes syncing."
                  />
                )
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricTile
                      icon={PlayCircle}
                      label="30-day runs"
                      value={storeRuns30d || operationalTotals.runs}
                    />
                    <MetricTile
                      icon={CheckCircle2}
                      label="Success rate"
                      value={`${successRate}%`}
                    />
                    <MetricTile
                      icon={Database}
                      label="Results produced"
                      value={operationalTotals.resultCount}
                    />
                    <MetricTile
                      icon={BarChart3}
                      label="Platform usage"
                      value={
                        hasPrivateUsageCost
                          ? `$${operationalTotals.usageCostUsd.toFixed(2)}`
                          : "Sync pending"
                      }
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatusMetric label="Failed" value={operationalTotals.failedRuns} />
                    <StatusMetric label="Aborted" value={operationalTotals.abortedRuns} />
                    <StatusMetric label="Timed out" value={operationalTotals.timedOutRuns} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent runs</CardTitle>
            </CardHeader>
            <CardContent>
              {recentRuns.length === 0 ? (
                <EmptyState
                  title="No recent runs"
                  description="Private run history is still syncing. Once available, runs are retained here with status, build, result count, and cost."
                />
              ) : (
                <div className="divide-border divide-y">
                  {recentRuns.map(
                    (run: {
                      id: string;
                      apifyRunId?: string;
                      buildId?: string | null;
                      status: string;
                      origin?: string | null;
                      resultCount?: number;
                      usageCostUsd?: string | number | null;
                      startedAt: string;
                    }) => (
                      <div
                        key={run.id}
                        className="grid gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/actors/${encodeURIComponent(id)}/runs/${encodeURIComponent(run.apifyRunId ?? run.id)}`}
                            className="hover:text-signal-orange truncate font-mono text-xs underline-offset-4 hover:underline"
                          >
                            {run.apifyRunId ?? run.id}
                          </Link>
                          <p className="text-muted-foreground text-xs">
                            {new Date(run.startedAt).toLocaleString()} ·{" "}
                            {run.origin ?? "Unknown origin"}
                          </p>
                          <Link
                            href={`/dashboard/actors/${encodeURIComponent(id)}/runs/${encodeURIComponent(run.apifyRunId ?? run.id)}`}
                            className="text-signal-orange mt-1 inline-block text-xs font-medium hover:underline"
                          >
                            View run details
                          </Link>
                        </div>
                        <Badge variant={run.status === "SUCCEEDED" ? "default" : "outline"}>
                          {run.status}
                        </Badge>
                        <div className="text-muted-foreground text-xs sm:text-right">
                          <p>
                            {run.resultCount == null
                              ? "Result count syncing"
                              : `${run.resultCount.toLocaleString()} results`}
                          </p>
                          <p>
                            {run.usageCostUsd == null
                              ? "Cost pending"
                              : `$${Number(run.usageCostUsd).toFixed(4)}`}
                          </p>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <ActorInsightsHistory
            snapshots={insightSnapshots}
            debugging={actor.apify?.debugging ?? null}
            lastSyncAt={actor.lastInsightSyncAt}
            syncStatus={actor.insightSyncStatus}
            syncError={actor.insightSyncError}
          />
        </TabsContent>

        {/* ── History tab ── */}
        <TabsContent value="history">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Copy variants */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">Recent copy variants</CardTitle>
              </CardHeader>
              <CardContent>
                {actor.copyVariants.length === 0 ? (
                  <EmptyState
                    title="No variants yet"
                    description='Open Actions → Optimize and click "Rewrite copy" to generate AI variants.'
                  />
                ) : (
                  <CopyVariantHistory variants={actor.copyVariants} />
                )}
              </CardContent>
            </Card>

            {/* Pricing history */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Pricing history</CardTitle>
              </CardHeader>
              <CardContent>
                {actor.pricingHistory.length === 0 ? (
                  <EmptyState
                    title="No pricing changes"
                    description="Pricing updates will be tracked here as they happen."
                  />
                ) : (
                  <ul className="space-y-2 text-xs">
                    {actor.pricingHistory.map(
                      (p: {
                        id: string;
                        model: string;
                        amount: number | string | null;
                        payload?: unknown;
                        changedAt: string;
                      }) => {
                        const events = pricingHistoryEvents(p.payload);
                        return (
                          <li key={p.id} className="border-border/40 space-y-2 border-b pb-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{p.model}</Badge>
                                <span className="text-muted-foreground">
                                  {events.length} {events.length === 1 ? "event" : "events"}
                                </span>
                              </div>
                              <span className="text-muted-foreground">
                                {new Date(p.changedAt).toLocaleDateString()}
                              </span>
                            </div>
                            {events.length > 0 ? (
                              <div className="space-y-1">
                                {events.map(([name, event]) => (
                                  <div
                                    key={name}
                                    className="flex items-center justify-between gap-3"
                                  >
                                    <span className="truncate font-mono">{name}</span>
                                    <span className="shrink-0 font-mono">
                                      ${pricingEventPrice(event)?.toFixed(6) ?? "—"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : p.amount ? (
                              <span className="font-mono">${String(p.amount)}</span>
                            ) : null}
                          </li>
                        );
                      },
                    )}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Manage tab ── */}
        <TabsContent value="manage" className="space-y-6">
          {latestOptimization ? (
            <Card>
              <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                <div>
                  <CardTitle className="text-sm">Latest listing audit</CardTitle>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {latestOptimization.currentScore != null
                      ? `${latestOptimization.currentScore}% current quality → ${latestOptimization.proposedScore}% proposed`
                      : latestOptimization.status.replaceAll("_", " ").toLowerCase()}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/dashboard/actors/optimization/${latestOptimization.runId}`}>
                    Review proposal
                  </Link>
                </Button>
              </CardHeader>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Actor tools</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4 text-sm">
                Use the tools below to improve listing copy and manage pricing for this actor.
              </p>
              <ActorActions
                actorId={actor.id}
                apifyActorId={actor.apifyActorId}
                apifyUsername={actor.username}
                actorName={actor.actorName}
                title={actorTitle}
                description={actorDescription}
                imageUrl={actorImageUrl}
                categories={actorCategories}
                metaLabels={actorMetaLabels}
                pricingEvents={Object.fromEntries(
                  actorPricingEvents.map(([name, event]) => [
                    name,
                    {
                      eventTitle: event.eventTitle,
                      eventDescription: event.eventDescription,
                      eventPriceUsd: pricingEventPrice(event) ?? undefined,
                      isOneTimeEvent: event.isOneTimeEvent,
                      isPrimaryEvent: event.isPrimaryEvent,
                    },
                  ]),
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </DashboardUrlTabs>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string | number;
}) {
  return (
    <div className="border-border/60 bg-muted/20 rounded-lg border p-4">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function StatusMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border/60 flex items-center justify-between rounded-lg border px-4 py-3">
      <span className="text-muted-foreground flex items-center gap-2 text-sm">
        <XCircle className="h-4 w-4" /> {label}
      </span>
      <span className="font-semibold tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="border-border/60 bg-card rounded-lg border p-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function StoreMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: any;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-border/60 bg-muted/20 rounded-lg border p-4">
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </div>
  );
}

function CatalogRecord({
  label,
  value,
}: {
  label: string;
  value: string | Date | null | undefined;
}) {
  const date = value ? new Date(value) : null;
  const readable =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString("en-IN", { dateStyle: "medium" })
      : "Not available";
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium">{readable}</dd>
    </div>
  );
}
