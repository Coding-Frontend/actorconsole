import { authenticatedServerFetch } from "@/lib/server-api";
import { Panel } from "@/components/ui/panel";
import { KeywordResearch } from "@/components/dashboard/keyword-research";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { ChartNoAxesCombined, Layers3 } from "lucide-react";

export default async function KeywordsPage() {
  const response = await authenticatedServerFetch("/actors");
  if (!response.ok) throw new Error("Could not load actors from the API");
  const body = await response.json();
  const actors = body.data as Array<{
    id: string;
    title: string | null;
    actorName: string;
    username: string;
  }>;
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="Workspace / Demand signals"
        title="Keyword research"
        description="Explore Store demand, shortlist opportunities, and compare competing Actors."
        breadcrumbs={[{ label: "Workspace" }, { label: "Keyword research" }]}
        secondaryActions={[
          {
            label: "Actor portfolio",
            href: "/dashboard/actors",
            icon: <Layers3 className="h-3.5 w-3.5" />,
          },
          {
            label: "Revenue comparison",
            href: "/dashboard/revenue",
            icon: <ChartNoAxesCombined className="h-3.5 w-3.5" />,
          },
        ]}
      />

      <Panel variant="default" radius="panel">
        <KeywordResearch actors={actors} />
      </Panel>
    </div>
  );
}
