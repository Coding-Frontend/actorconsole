import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/admin/stat-card";
import { PageHeader } from "@/components/admin/page-header";
import { Sparkline } from "@/components/admin/sparkline";
import { api } from "@/lib/admin/server-api";
import { formatINR, formatNumber } from "@/lib/utils";
import { BarChart3, TrendingUp, Users, CreditCard } from "lucide-react";
import { AdminApiError } from "@/components/admin/admin-pagination";

export default async function AnalyticsPage() {
  const [mrr90, signups90, overview] = await Promise.all([
    api<any>("/admin/metrics/mrr", { params: { days: 90 } }),
    api<any>("/admin/metrics/signups", { params: { days: 90 } }),
    api<any>("/admin/metrics/overview"),
  ]);

  const mrr: { date: string; amount: number }[] = mrr90.ok ? mrr90.data : [];
  const signups: { date: string; count: number }[] = signups90.ok ? signups90.data : [];
  const data = overview.ok ? overview.data : null;
  const errors = [
    !mrr90.ok ? `Revenue: ${mrr90.error.message ?? "request failed"}` : null,
    !signups90.ok ? `Signups: ${signups90.error.message ?? "request failed"}` : null,
    !overview.ok ? `Overview: ${overview.error.message ?? "request failed"}` : null,
  ].filter((message): message is string => Boolean(message));

  const totalRevenue = mrr.reduce((s, d) => s + d.amount, 0);
  const totalSignups = signups.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description="Track growth, revenue, and platform adoption over time."
      />

      {errors.length ? <AdminApiError message={errors.join(" · ")} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue (90d)"
          value={formatINR(totalRevenue)}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard label="Signups (90d)" value={formatNumber(totalSignups)} icon={Users} />
        <StatCard
          label="Active subs"
          value={formatNumber(data?.activeSubscriptions ?? 0)}
          icon={CreditCard}
        />
        <StatCard label="MRR" value={formatINR(data?.mrr.amount ?? 0)} icon={BarChart3} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily revenue · last 90 days</CardTitle>
        </CardHeader>
        <CardContent>
          {mrr.length ? (
            <Sparkline
              data={mrr.map((d) => ({ x: d.date, y: d.amount }))}
              valueFormatter="inr"
              height={280}
            />
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">No data yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily signups · last 90 days</CardTitle>
        </CardHeader>
        <CardContent>
          {signups.length ? (
            <Sparkline
              data={signups.map((d) => ({ x: d.date, y: d.count }))}
              valueFormatter="number"
              height={280}
            />
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">No data yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
