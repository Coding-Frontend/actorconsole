import { workspaceApifyRequiredPage } from "@/components/dashboard/workspace-apify-required-page";
import { FinancialAnalyticsPage } from "@/components/dashboard/financial-analytics-page";
import { UsageAccountDataRefresher } from "@/components/dashboard/usage-account-data-refresher";
import { UsageSyncButton } from "@/components/dashboard/usage-sync-button";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { financialLastSynchronizedAt, loadFinancialDashboard } from "@/lib/financial-dashboard";
import { Search } from "lucide-react";

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const setup = await workspaceApifyRequiredPage("Revenue");
  if (setup) return setup;
  const payload = await loadFinancialDashboard("revenue", await searchParams);
  const synchronizedAt = financialLastSynchronizedAt(payload, "revenue");
  return (
    <div className="space-y-6">
      <UsageAccountDataRefresher scope="revenue" syncedAt={payload.accountUsage?.syncedAt} />
      <DashboardPageHeader
        context="Actor monetization"
        title="Revenue"
        description="Compare creator revenue, direct and allocated cost, profit, and margin for every Actor and day."
        breadcrumbs={[{ label: "Operations" }, { label: "Revenue" }]}
        status={
          <span className="text-muted-foreground font-mono text-[10px]">
            {synchronizedAt
              ? `Last synchronized ${new Date(synchronizedAt).toLocaleString("en-IN", { timeZone: "UTC", timeZoneName: "short" })}`
              : "Revenue history has not been synchronized yet."}
          </span>
        }
        primaryAction={<UsageSyncButton scope="revenue" />}
        secondaryActions={[
          {
            label: "Keyword research",
            href: "/dashboard/keywords",
            icon: <Search className="h-3.5 w-3.5" />,
          },
        ]}
      />
      <FinancialAnalyticsPage kind="revenue" payload={payload} />
    </div>
  );
}
