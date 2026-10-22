import { workspaceApifyRequiredPage } from "@/components/dashboard/workspace-apify-required-page";
import { FinancialAnalyticsPage } from "@/components/dashboard/financial-analytics-page";
import { UsageAccountDataRefresher } from "@/components/dashboard/usage-account-data-refresher";
import { UsageSyncButton } from "@/components/dashboard/usage-sync-button";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { financialLastSynchronizedAt, loadFinancialDashboard } from "@/lib/financial-dashboard";

export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const setup = await workspaceApifyRequiredPage("Costs");
  if (setup) return setup;
  const payload = await loadFinancialDashboard("costs", await searchParams);
  const synchronizedAt = financialLastSynchronizedAt(payload, "costs");
  return (
    <div className="space-y-6">
      <UsageAccountDataRefresher scope="costs" syncedAt={payload.accountUsage?.syncedAt} />
      <DashboardPageHeader
        context="Organization billing"
        title="Costs"
        description="Inspect daily Apify spend, service charges, direct Actor costs, and allocated workspace overhead."
        breadcrumbs={[{ label: "Operations" }, { label: "Costs" }]}
        status={
          <span className="text-muted-foreground font-mono text-[10px]">
            {synchronizedAt
              ? `Last synchronized ${new Date(synchronizedAt).toLocaleString("en-IN", { timeZone: "UTC", timeZoneName: "short" })}`
              : "Cost history has not been synchronized yet."}
          </span>
        }
        primaryAction={<UsageSyncButton scope="costs" />}
      />
      <FinancialAnalyticsPage kind="costs" payload={payload} />
    </div>
  );
}
