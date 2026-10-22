import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/admin/stat-card";
import { PageHeader } from "@/components/admin/page-header";
import { api } from "@/lib/admin/server-api";
import { formatINR, formatNumber, relativeTime } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Calendar,
  CreditCard,
  KeyRound,
  LifeBuoy,
  Radio,
  TrendingUp,
  Users,
  Webhook,
} from "lucide-react";
import { Sparkline } from "@/components/admin/sparkline";
import { AdminApiError } from "@/components/admin/admin-pagination";

export default async function AdminDashboardPage() {
  const [overviewRes, mrrRes, signupsRes, integrationsRes] = await Promise.all([
    api<any>("/admin/metrics/overview"),
    api<any>("/admin/metrics/mrr", { params: { days: 30 } }),
    api<any>("/admin/metrics/signups", { params: { days: 30 } }),
    api<AdminIntegrationHealth[]>("/admin/integrations"),
  ]);

  const overview = overviewRes.ok ? overviewRes.data : null;
  const mrr: { date: string; amount: number }[] = mrrRes.ok ? mrrRes.data : [];
  const signups: { date: string; count: number }[] = signupsRes.ok ? signupsRes.data : [];
  const apifyCredentialIssues = integrationsRes.ok
    ? integrationsRes.data.filter(
        (integration) =>
          integration.key.startsWith("apify_") &&
          integration.isConfigured &&
          integration.testStatus === "error" &&
          integration.isActive !== false,
      )
    : [];

  if (!overview) {
    return (
      <Card className="border-destructive/30 overflow-hidden">
        <div className="bg-destructive h-0.5" />
        <CardContent className="p-8 text-center sm:p-12">
          <AlertTriangle className="text-destructive mx-auto h-6 w-6" />
          <h1 className="font-display-tight mt-4 text-2xl">Metrics link unavailable</h1>
          <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-sm leading-relaxed">
            Metrics are temporarily unavailable. Refresh this page or sign in again.
          </p>
        </CardContent>
      </Card>
    );
  }

  const openTickets = overview.platform.openTickets ?? 0;
  const healthWarning = overview.health.errors24h > 50 || openTickets > 10;
  const partialErrors = [
    !mrrRes.ok ? `Revenue: ${mrrRes.error.message ?? "request failed"}` : null,
    !signupsRes.ok ? `Signups: ${signupsRes.error.message ?? "request failed"}` : null,
    !integrationsRes.ok
      ? `Integration health: ${integrationsRes.error.message ?? "request failed"}`
      : null,
  ].filter((message): message is string => Boolean(message));

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Control room"
        description="Commercial performance, builder activity, and platform health in one operational view."
        actions={
          <span className="border-border bg-card text-muted-foreground inline-flex h-9 items-center gap-2 rounded-md border px-3 font-mono text-[10px] uppercase tracking-[0.08em] shadow-sm">
            <Radio className="text-signal-orange h-3.5 w-3.5" /> Live metrics
          </span>
        }
      />

      {partialErrors.length ? <AdminApiError message={partialErrors.join(" · ")} /> : null}

      {apifyCredentialIssues.length > 0 ? (
        <Card className="border-destructive/35 bg-destructive/[0.045] overflow-hidden">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-start gap-3">
              <span className="border-destructive/30 bg-destructive/10 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border">
                <KeyRound className="text-destructive h-4 w-4" />
              </span>
              <div>
                <p className="type-kicker text-destructive">Admin integration attention</p>
                <h2 className="font-display-tight mt-1 text-xl">Apify credentials need updating</h2>
                <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
                  Active Apify credentials need attention. Shared catalog, leaderboard, and
                  scheduled sync operations may be interrupted until they are replaced.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {apifyCredentialIssues.map((integration) => (
                    <Badge
                      key={integration.key}
                      variant="destructive"
                      className="font-mono text-[10px] uppercase"
                    >
                      {integration.label} · not working
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <Button size="sm" className="shrink-0" asChild>
              <Link href="/admin/integrations">
                Update credentials <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Users"
          value={formatNumber(overview.users.total)}
          delta={overview.users.growthPct}
          hint={`+${overview.users.newThisMonth} this month`}
          icon={Users}
        />
        <StatCard
          label="Revenue MTD"
          value={formatINR(overview.mrr.amount)}
          hint={`${overview.mrr.paymentCount} captures this month`}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Subscriptions"
          value={formatNumber(overview.activeSubscriptions)}
          hint="Currently active"
          icon={CreditCard}
        />
        <StatCard
          label="Open tickets"
          value={formatNumber(openTickets)}
          icon={LifeBuoy}
          tone={openTickets > 10 ? "warning" : "default"}
          hint="Awaiting response"
        />
        <StatCard
          label="Errors / 24h"
          value={formatNumber(overview.health.errors24h)}
          icon={AlertTriangle}
          tone={overview.health.errors24h > 50 ? "warning" : "default"}
          hint={healthWarning ? "Review recommended" : "Within baseline"}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.7fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="border-border/80 border-b pb-4 sm:pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="type-kicker text-signal-blue">Commercial trace</p>
                <CardTitle className="font-display-tight mt-1 text-[22px]">
                  Revenue / 30 days
                </CardTitle>
                <CardDescription>
                  Daily captured payments across configured gateways.
                </CardDescription>
              </div>
              <Badge variant="outline" className="font-mono uppercase">
                INR · daily
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {mrr.length > 0 ? (
              <Sparkline
                data={mrr.map((entry) => ({ x: entry.date, y: entry.amount }))}
                valueFormatter="inr"
              />
            ) : (
              <ChartEmpty label="No captured payments in this window" />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-border/80 border-b pb-4 sm:pb-4">
            <p className="type-kicker text-signal-orange">Customer mix</p>
            <CardTitle className="font-display-tight mt-1 text-[22px]">Plan distribution</CardTitle>
            <CardDescription>Workspaces by operating tier.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-5 sm:p-6">
            {(["FREE", "PRO"] as const).map((plan, index) => {
              const count = plan === "FREE" ? overview.plans.free : overview.plans.pro;
              const percentage = Math.round((count / Math.max(overview.workspaces.total, 1)) * 100);
              return (
                <div key={plan}>
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em]">
                        {plan}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-[11px]">
                        {formatNumber(count)} workspaces
                      </p>
                    </div>
                    <span className="font-display-tight text-xl tabular-nums">{percentage}%</span>
                  </div>
                  <div className="bg-muted h-1.5 overflow-hidden rounded-[2px]">
                    <div
                      className={index === 1 ? "bg-signal-orange h-full" : "bg-signal-blue h-full"}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="border-border/80 border-b pb-4 sm:pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="type-kicker text-signal-blue">Acquisition trace</p>
                <CardTitle className="font-display-tight mt-1 text-[22px]">
                  Signups / 30 days
                </CardTitle>
              </div>
              <Badge variant="outline" className="font-mono uppercase">
                Accounts · daily
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {signups.length > 0 ? (
              <Sparkline
                data={signups.map((entry) => ({ x: entry.date, y: entry.count }))}
                valueFormatter="number"
              />
            ) : (
              <ChartEmpty label="No signups in this window" />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-border/80 border-b pb-4 sm:pb-4">
            <p className="type-kicker text-signal-orange">System inventory</p>
            <CardTitle className="font-display-tight mt-1 text-[22px]">Platform volume</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 p-0 sm:p-0">
            <PlatformStat icon={Bot} label="Actors" value={overview.platform.actors} />
            <PlatformStat
              icon={Calendar}
              label="Publishing schedules"
              value={overview.platform.publishingSchedules}
            />
            <PlatformStat
              icon={Webhook}
              label="Webhooks / 24h"
              value={overview.health.webhooks24h}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-border/80 flex items-end justify-between gap-4 border-b px-5 py-4 sm:px-6">
          <div>
            <p className="type-kicker text-signal-orange">Account ledger</p>
            <h2 className="font-display-tight mt-1 text-[22px]">Recent signups</h2>
          </div>
          <Link
            href="/admin/users"
            className="text-muted-foreground hover:text-signal-orange focus-visible:ring-ring inline-flex items-center gap-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            Open directory <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <CardContent className="p-0 sm:p-0">
          {overview.recentSignups.length > 0 ? (
            <ol className="divide-border/70 divide-y">
              {overview.recentSignups.map((user: any, index: number) => (
                <li key={user.id}>
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="hover:bg-accent/55 focus-visible:ring-ring group grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset sm:grid-cols-[32px_minmax(0,1fr)_110px_120px] sm:px-6"
                  >
                    <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="group-hover:text-signal-orange block truncate text-sm font-semibold transition-colors">
                        {user.name ?? user.email}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {user.email}
                      </span>
                    </span>
                    <Badge
                      variant={
                        user.businessProfiles?.[0]?.plan === "FREE" ? "secondary" : "outline"
                      }
                      className="hidden justify-self-start sm:inline-flex"
                    >
                      {user.businessProfiles?.length
                        ? `${user.businessProfiles.length} workspace${user.businessProfiles.length === 1 ? "" : "s"}`
                        : "No workspace"}
                    </Badge>
                    <span className="text-muted-foreground text-right font-mono text-[10px]">
                      {relativeTime(user.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground p-8 text-center text-sm">No recent signups.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface AdminIntegrationHealth {
  key: string;
  label: string;
  isConfigured: boolean;
  isActive?: boolean;
  testStatus: string | null;
  testMessage: string | null;
}

function PlatformStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Bot;
  label: string;
  value: number;
}) {
  return (
    <div className="border-border/80 hover:bg-accent/55 group border-b border-r p-4 transition-colors odd:border-r even:border-r-0 sm:p-5 [&:nth-last-child(-n+2)]:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-[11px]">{label}</p>
        <Icon className="text-signal-blue h-3.5 w-3.5" />
      </div>
      <p className="font-display-tight text-2xl tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="border-border/70 bg-muted/25 text-muted-foreground flex min-h-44 items-center justify-center rounded-sm border border-dashed text-sm">
      {label}
    </div>
  );
}
