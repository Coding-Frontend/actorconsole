import { Suspense } from "react";
import type { Metadata } from "next";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { SeoTool } from "@/components/intelligence/seo-tool";
import { ToolNavigation } from "@/components/intelligence/tool-navigation";
import { ToolContentSkeleton } from "@/components/marketing/public-data-skeleton";

export const metadata: Metadata = { title: "Actor listing SEO audit" };

export default function Page() {
  return (
    <div className="space-y-8">
      <DashboardPageHeader
        context="Research"
        title="SEO audit"
        description="Spot missing metadata and unclear documentation with a public listing audit."
        breadcrumbs={[
          { label: "Actor research", href: "/dashboard/research" },
          { label: "SEO audit" },
        ]}
      />
      <ToolNavigation active="seo" surface="dashboard" />
      <Suspense fallback={<ToolContentSkeleton kind="seo" />}>
        <SeoTool />
      </Suspense>
    </div>
  );
}
