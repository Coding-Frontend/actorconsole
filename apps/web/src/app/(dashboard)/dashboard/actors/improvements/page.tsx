import { ArrowLeft } from "lucide-react";
import { ActorImprovementHistory } from "@/components/dashboard/actor-improvement-history";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";

export default function ActorImprovementsPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="Workspace / Actors"
        title="Improvement generations"
        description="Review every bulk and single-Actor generation, approve individual fields, and track what was applied to Apify."
        breadcrumbs={[
          { label: "Workspace", href: "/dashboard" },
          { label: "Actors", href: "/dashboard/actors" },
          { label: "Improvements" },
        ]}
        secondaryActions={[
          {
            label: "Back to Actors",
            href: "/dashboard/actors",
            icon: <ArrowLeft className="h-3.5 w-3.5" />,
          },
        ]}
      />
      <ActorImprovementHistory />
    </div>
  );
}
