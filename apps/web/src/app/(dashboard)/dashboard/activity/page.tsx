import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { authenticatedServerFetch } from "@/lib/server-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";

type ActivityItem = {
  id: string;
  category: "Publishing" | "Improvements" | "Sync" | "Connection";
  title: string;
  description: string;
  status: string;
  date: string;
  href: string;
};

type Summary = {
  credentialHealth?: {
    configured: boolean;
    hasIssue: boolean;
    validatedAt?: string | null;
    validationError?: string | null;
  };
};

async function readData(path: string): Promise<unknown | null> {
  try {
    const response = await authenticatedServerFetch(path);
    if (!response.ok) return null;
    const body = await response.json();
    return body?.ok ? body.data : null;
  } catch {
    return null;
  }
}

function readable(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase();
}

function statusTone(status: string) {
  if (/fail|block|invalid|expired/i.test(status)) return "destructive" as const;
  if (/ready|queue|running|apply|pending/i.test(status)) return "warning" as const;
  return "success" as const;
}

export default async function WorkspaceActivityPage() {
  const [summaryData, scheduleData, improvementData, actorsData] = await Promise.all([
    readData("/account/dashboard-summary"),
    readData("/bulk-publishing/schedules"),
    readData("/actors/optimization/runs?limit=30"),
    readData("/actors?format=page&status=all&limit=30"),
  ]);
  const summary = (summaryData ?? {}) as Summary;
  const schedules = (Array.isArray(scheduleData) ? scheduleData : []) as Array<{
    id: string;
    name: string;
    runs: Array<{
      id: string;
      status: string;
      publishedCount: number;
      attemptedCount: number;
      startedAt?: string | null;
      createdAt: string;
    }>;
  }>;
  const improvements =
    (
      improvementData as {
        items?: Array<{
          id: string;
          kind: string;
          status: string;
          totalCount: number;
          appliedCount: number;
          createdAt: string;
          approvedAt?: string | null;
          appliedAt?: string | null;
        }>;
      } | null
    )?.items ?? [];
  const syncedActors =
    (
      actorsData as {
        items?: Array<{
          id: string;
          title: string | null;
          actorName: string;
          lastOperationalSyncAt: string | null;
          lastRunSyncAt: string | null;
          readinessSyncedAt: string | null;
        }>;
      } | null
    )?.items ?? [];
  const health = summary.credentialHealth;
  const items: ActivityItem[] = [
    ...(health?.hasIssue && health.validatedAt
      ? [
          {
            id: `connection-${health.validatedAt}`,
            category: "Connection" as const,
            title: "Apify connection needs attention",
            description: health.validationError ?? "The latest credential check failed.",
            status: "FAILED",
            date: health.validatedAt,
            href: "/dashboard/apify",
          },
        ]
      : []),
    ...schedules.flatMap((schedule) =>
      schedule.runs.map((run) => ({
        id: `publishing-${run.id}`,
        category: "Publishing" as const,
        title: schedule.name,
        description: `${run.publishedCount} published from ${run.attemptedCount} attempted`,
        status: run.status,
        date: run.startedAt ?? run.createdAt,
        href: "/dashboard/publishing/schedules",
      })),
    ),
    ...improvements.map((run) => ({
      id: `improvement-${run.id}`,
      category: "Improvements" as const,
      title: readable(run.kind).replace(/^./, (letter) => letter.toUpperCase()),
      description: `${run.appliedCount} of ${run.totalCount} Actors applied`,
      status: run.status,
      date: run.appliedAt ?? run.approvedAt ?? run.createdAt,
      href: `/dashboard/actors/optimization/${run.id}`,
    })),
    ...syncedActors.flatMap((actor) => {
      const dates = [actor.lastOperationalSyncAt, actor.lastRunSyncAt, actor.readinessSyncedAt].filter(
        (value): value is string => Boolean(value),
      );
      if (!dates.length) return [];
      return [
        {
          id: `sync-${actor.id}`,
          category: "Sync" as const,
          title: actor.title ?? actor.actorName,
          description: "Actor data synchronized",
          status: "SYNCED",
          date: dates.sort(
            (left, right) => new Date(right).getTime() - new Date(left).getTime(),
          )[0],
          href: `/dashboard/actors/${actor.id}`,
        },
      ];
    }),
  ]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 40);
  const unavailable = [summaryData, scheduleData, improvementData, actorsData].filter(
    (value) => value === null,
  ).length;

  return (
    <div className="space-y-5">
      <DashboardPageHeader
        context="Workspace / Operations"
        title="Activity"
        description="Recent publishing, Actor improvements, and syncs for this workspace."
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Activity" }]}
        primaryAction={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/activity?refresh=1">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Link>
          </Button>
        }
      />
      {unavailable ? (
        <p
          className="border-signal-orange/30 bg-signal-orange/5 rounded-md border p-3 text-sm"
          role="status"
        >
          {unavailable} activity source{unavailable === 1 ? " is" : "s are"} temporarily
          unavailable. Available records are shown below.
        </p>
      ) : null}
      {health ? (
        <section
          className="border-border bg-card flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between"
          aria-label="Current Apify connection"
        >
          <div className="flex items-start gap-3">
            {health.hasIssue ? (
              <AlertTriangle className="text-destructive mt-0.5 h-4 w-4" />
            ) : health.configured ? (
              <CheckCircle2 className="text-signal-green mt-0.5 h-4 w-4" />
            ) : (
              <Clock3 className="text-muted-foreground mt-0.5 h-4 w-4" />
            )}
            <div>
              <p className="text-sm font-semibold">
                Apify connection{" "}
                {health.hasIssue
                  ? "needs attention"
                  : health.configured
                    ? "is connected"
                    : "is not configured"}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {health.validationError ??
                  (health.validatedAt
                    ? `Last checked ${new Date(health.validatedAt).toLocaleString("en-IN")}`
                    : "No connection check recorded yet.")}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/apify">
              Manage connection <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </section>
      ) : null}
      <section
        className="border-border bg-card overflow-hidden rounded-md border"
        aria-label="Recent workspace activity"
      >
        <div className="border-border flex items-center gap-2 border-b px-4 py-3">
          <Activity className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Recent events</h2>
          <span className="text-muted-foreground ml-auto text-xs">{items.length} shown</span>
        </div>
        {items.length ? (
          <ol className="divide-border/70 divide-y">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="hover:bg-muted/30 focus-visible:ring-ring flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 sm:flex-nowrap"
                >
                  <span className="text-muted-foreground w-24 shrink-0 text-xs">
                    {new Date(item.date).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {item.category} · {item.description}
                    </span>
                  </span>
                  <Badge variant={statusTone(item.status)} className="capitalize">
                    {readable(item.status)}
                  </Badge>
                  <ArrowRight className="text-muted-foreground h-4 w-4" />
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground px-4 py-10 text-center text-sm">
            No operation history yet. Connect Apify, sync Actors, or create a publishing schedule to
            get started.
          </p>
        )}
      </section>
    </div>
  );
}
