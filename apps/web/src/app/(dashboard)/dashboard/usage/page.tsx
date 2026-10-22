import { workspaceApifyRequiredPage } from "@/components/dashboard/workspace-apify-required-page";
import { FinancialAnalyticsPage } from "@/components/dashboard/financial-analytics-page";
import { UsageSyncButton } from "@/components/dashboard/usage-sync-button";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { financialLastSynchronizedAt, loadFinancialDashboard } from "@/lib/financial-dashboard";

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const setup = await workspaceApifyRequiredPage("Usage");
  if (setup) return setup;
  const payload = await loadFinancialDashboard("usage", await searchParams);
  const synchronizedAt = financialLastSynchronizedAt(payload, "usage");
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="Workspace analytics"
        title="Usage"
        description="Track Actor runs, outcomes, results, and active users without mixing in financial metrics."
        breadcrumbs={[{ label: "Operations" }, { label: "Usage" }]}
        status={
          <span className="text-muted-foreground font-mono text-[10px]">
            {synchronizedAt
              ? `Last synchronized ${new Date(synchronizedAt).toLocaleString("en-IN", { timeZone: "UTC", timeZoneName: "short" })}`
              : "Usage has not been synchronized yet."}
          </span>
        }
        primaryAction={<UsageSyncButton scope="usage" />}
      />
      <FinancialAnalyticsPage kind="usage" payload={payload} />
    </div>
  );
}
