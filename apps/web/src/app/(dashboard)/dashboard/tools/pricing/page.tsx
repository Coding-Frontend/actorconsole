import type { Metadata } from "next";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { PricingTool } from "@/components/intelligence/pricing-tool";
import { ToolNavigation } from "@/components/intelligence/tool-navigation";

export const metadata: Metadata = { title: "Actor pricing calculator" };

export default function Page() {
  return (
    <div className="space-y-8">
      <DashboardPageHeader
        context="Research"
        title="Pricing calculator"
        description="Test a price before you publish. See how result volume and service costs affect your margin."
        breadcrumbs={[
          { label: "Actor research", href: "/dashboard/research" },
          { label: "Pricing calculator" },
        ]}
      />
      <ToolNavigation active="pricing" surface="dashboard" />
      <PricingTool />
    </div>
  );
}
