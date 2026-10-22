import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { authenticatedServerFetch } from "@/lib/server-api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SmartInsightBanner } from "@/components/ui/smart-insight-banner";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import DashboardLoading from "./loading";
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  CalendarClock,
  ListTodo,
  Search,
  Sparkles,
} from "lucide-react";

function getGreeting(name: string | null | undefined) {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${timeOfDay}, ${name ?? "builder"}`;
}

function formatShortDate(value: Date | string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface DashboardSummary {
  actorCount: number;
  publishingScheduleCount: number;
  queueCounts?: { operations?: number; total?: number };
  usageCostTotal: number | string;
  recentActors: Array<{
    id: string;
    title: string | null;
    actorName: string;
    username: string;
    updatedAt: string;
  }>;
  credentialHealth: {
    configured: boolean;
    hasIssue: boolean;
    validationError?: string | null;
    validatedAt?: string | null;
    apiKey?: { configured: boolean; status: string };
    uiToken?: { configured: boolean; status: string };
    cookies?: { configured: boolean; status: string };
  };
}

export default async function DashboardOverviewPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/dashboard");
  }

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardOverviewContent userName={session.user.name} />
    </Suspense>
  );
}

async function DashboardOverviewContent({ userName }: { userName: string | null | undefined }) {
  const response = await authenticatedServerFetch("/account/dashboard-summary");
  if (!response.ok) throw new Error("Could not load dashboard summary from the API");
  const body = await response.json();
  const summary = body.data as DashboardSummary;
  const { actorCount, publishingScheduleCount, recentActors } = summary;
  const usageCostTotal = Number(summary.usageCostTotal ?? 0);
  const queueCount = Number(summary.queueCounts?.total ?? 0);
  const recentActor = usageCostTotal > 0 && recentActors.length > 0 ? recentActors[0] : null;

  const stats = [
    {
      label: "Tracked actors",
      value: actorCount.toLocaleString(),
      detail: "Portfolio coverage",
      icon: Sparkles,
      href: "/dashboard/actors",
      tone: "orange",
    },
    {
      label: "Publishing schedules",
      value: publishingScheduleCount.toLocaleString(),
      detail: "Publishing queues online",
      icon: CalendarClock,
      href: "/dashboard/publishing/schedules",
      tone: "blue",
    },
    {
      label: "Active queue",
      value: queueCount.toLocaleString(),
      detail: "Publishing and operations",
      icon: ListTodo,
      href: "/dashboard/activity",
      tone: "orange",
    },
    {
      label: "Usage cost / 30d",
      value: `$${usageCostTotal.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      detail: "Apify consumption",
      icon: CircleDollarSign,
      href: "/dashboard/costs",
      tone: "blue",
    },
  ] as const;

  return (
    <div className="space-y-5 sm:space-y-6">
      <DashboardPageHeader
        context="Operational pulse"
        title={getGreeting(userName)}
        description="Portfolio health, publishing activity, and work that needs your attention."
        breadcrumbs={[{ label: "Workspace" }, { label: "Overview" }]}
        status={<span className="text-muted-foreground font-mono text-[10px]">/ UTC live</span>}
        secondaryActions={[
          {
            label: "Browse actors",
            href: "/dashboard/actors",
            icon: <Search className="h-3.5 w-3.5" />,
          },
        ]}
        primaryAction={
          <Button variant="signal" size="sm" className="w-full sm:w-auto" asChild>
            <Link href="/dashboard/publishing/schedules/new">
              <CalendarClock className="h-4 w-4" /> New publishing schedule
            </Link>
          </Button>
        }
      />

      <nav
        aria-label="Actor intelligence"
        className="border-border flex flex-wrap gap-x-6 gap-y-3 border-y py-4 text-sm"
      >
        <Link href="/dashboard/research" className="underline underline-offset-4">
          Discover Actors
        </Link>
        <Link href="/dashboard/watchlist" className="underline underline-offset-4">
          Follow competitors
        </Link>
        <Link href="/dashboard/profitability" className="underline underline-offset-4">
          Review profitability
        </Link>
      </nav>

      <section className="border-border/80 bg-card overflow-hidden rounded-sm border shadow-sm">
        <div className="border-border/80 grid sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(({ label, value, detail, icon: Icon, href, tone }, index) => (
            <Link
              key={label}
              href={href}
              className="border-border/80 hover:bg-accent/55 focus-visible:ring-ring group relative min-w-0 px-5 py-4 transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset sm:border-r lg:[&:last-child]:border-r-0 sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r"
            >
              {index === 2 ? (
                <span className="border-border/80 absolute inset-x-0 top-0 border-t sm:hidden" />
              ) : null}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="data-stamp text-muted-foreground uppercase tracking-[0.07em]">
                    {label}
                  </p>
                  <p className="font-display-tight mt-2 text-[28px] tabular-nums">{value}</p>
                  <p className="text-muted-foreground mt-1 text-[11px]">{detail}</p>
                </div>
                <Icon
                  className={
                    tone === "orange" ? "text-signal-orange h-4 w-4" : "text-signal-blue h-4 w-4"
                  }
                  strokeWidth={1.9}
                />
              </div>
              <span className="bg-signal-blue absolute inset-x-5 bottom-0 h-px origin-left scale-x-0 transition-transform duration-200 group-hover:scale-x-100" />
            </Link>
          ))}
        </div>
      </section>

      <section className="border-border/80 bg-card flex flex-col gap-3 rounded-sm border px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border ${summary.credentialHealth.hasIssue ? "border-destructive/35 bg-destructive/10 text-destructive" : summary.credentialHealth.configured ? "border-signal-green/35 bg-signal-green/10 text-signal-green" : "border-signal-orange/35 bg-signal-orange/10 text-signal-orange"}`}
            aria-hidden="true"
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="type-kicker text-muted-foreground">Workspace health</p>
            <p className="mt-1 text-sm font-semibold">
              {summary.credentialHealth.hasIssue
                ? "Credentials need attention"
                : summary.credentialHealth.configured
                  ? "Connected and ready"
                  : "Connect Apify to unlock operations"}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {summary.credentialHealth.hasIssue
                ? "Only the affected credential needs to be replaced."
                : summary.credentialHealth.configured
                  ? "Actor sync, analytics, and publishing status are available for this workspace."
                  : "You can still explore the dashboard while setup is incomplete."}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link
            href={
              summary.credentialHealth.hasIssue || !summary.credentialHealth.configured
                ? "/dashboard/apify"
                : "/dashboard/actors"
            }
          >
            {summary.credentialHealth.hasIssue
              ? "Review connection"
              : summary.credentialHealth.configured
                ? "Open portfolio"
                : "Connect Apify"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>

      {summary.credentialHealth.hasIssue ? (
        <section className="border-destructive/35 bg-destructive/[0.045] overflow-hidden rounded-md border">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-start gap-3">
              <span className="border-destructive/30 bg-destructive/10 mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border">
                <AlertTriangle className="text-destructive h-4 w-4" />
              </span>
              <div>
                <p className="type-kicker text-destructive">Connection attention required</p>
                <h3 className="font-display-tight mt-1 text-xl">Update your Apify credentials</h3>
                <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
                  {summary.credentialHealth.validationError ??
                    "One or more saved Apify credentials are no longer working. Update them to restore workspace operations."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {credentialHealthBadges(summary.credentialHealth).map((label) => (
                    <Badge
                      key={label}
                      variant="destructive"
                      className="font-mono text-[10px] uppercase"
                    >
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard/apify">
                  Update credentials <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard/support/new?from=connection">Ask support</Link>
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {usageCostTotal > 0 && recentActor ? (
        <SmartInsightBanner
          insights={[
            {
              id: "usage-cost",
              type: "opportunity",
              title: "Usage-cost signal",
              description: `${recentActor.title ?? recentActor.actorName} had the most recent activity; tracked actors incurred $${usageCostTotal.toFixed(2)} in Apify usage costs over 30 days.`,
              action: { label: "Inspect costs", href: "/dashboard/costs" },
            },
            {
              id: "actor-count",
              type: "opportunity",
              title: `${actorCount} actor${actorCount !== 1 ? "s" : ""} tracked`,
              description:
                actorCount > 0
                  ? "Open an actor to manage Store copy, images, pricing, and schedules."
                  : "Connect your Apify account to start tracking actors.",
              action: { label: "Browse actors", href: "/dashboard/actors" },
            },
          ]}
        />
      ) : null}

      <div>
        <Card className="overflow-hidden">
          <div className="border-border/80 flex items-center justify-between border-b px-5 py-4 sm:px-6">
            <div>
              <p className="type-kicker text-signal-blue">Portfolio register</p>
              <h3 className="font-display-tight mt-1 text-[22px]">Recently touched actors</h3>
            </div>
            {recentActors.length > 0 ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/actors">
                  View portfolio <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
          <CardContent className="p-0 sm:p-0">
            {recentActors.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No actors in the register"
                  description="Connect your Apify account and sync your portfolio to begin tracking."
                  action={{ label: "Connect Apify", href: "/dashboard/apify" }}
                />
              </div>
            ) : (
              <ol className="divide-border/70 divide-y">
                {recentActors.map((actor, index) => (
                  <li key={actor.id}>
                    <Link
                      href={`/dashboard/actors/${actor.id}`}
                      className="hover:bg-accent/55 focus-visible:ring-ring group grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-6"
                    >
                      <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">
                        <span className="group-hover:text-signal-orange block truncate text-sm font-semibold transition-colors">
                          {actor.title ?? actor.actorName}
                        </span>
                        <span className="text-muted-foreground block truncate font-mono text-[10px]">
                          {actor.username}/{actor.actorName}
                        </span>
                      </span>
                      <span className="text-muted-foreground hidden items-center gap-3 text-right sm:flex">
                        <span className="font-mono text-[10px] uppercase tracking-[0.05em]">
                          Updated {formatShortDate(actor.updatedAt)}
                        </span>
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function credentialHealthBadges(health: DashboardSummary["credentialHealth"]): string[] {
  const unhealthy = new Set(["EXPIRED", "INVALID", "ERROR"]);
  return [
    health.apiKey?.configured && unhealthy.has(health.apiKey.status)
      ? `API key · ${health.apiKey.status}`
      : null,
    health.uiToken?.configured && unhealthy.has(health.uiToken.status)
      ? `UI token · ${health.uiToken.status}`
      : null,
    health.cookies?.configured && unhealthy.has(health.cookies.status)
      ? `Cookies · ${health.cookies.status}`
      : null,
  ].filter((label): label is string => Boolean(label));
}
