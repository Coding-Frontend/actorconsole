import { ActorsWorkspace } from "@/components/dashboard/actors-workspace";
import { History, Search } from "lucide-react";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { LogoRecommendations } from "@/components/dashboard/logo-recommendations";

export default async function ActorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const initialParams = await searchParams;
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="Workspace / Actor portfolio"
        title="Actors"
        description="Find, evaluate, and improve the Actors connected to this workspace."
        breadcrumbs={[{ label: "Workspace" }, { label: "Actors" }]}
        secondaryActions={[
          {
            label: "Keyword research",
            href: "/dashboard/keywords",
            icon: <Search className="h-3.5 w-3.5" />,
          },
          {
            label: "Generation history",
            href: "/dashboard/actors/improvements",
            icon: <History className="h-3.5 w-3.5" />,
          },
        ]}
      />
      <LogoRecommendations />
      <ActorsWorkspace initialParams={initialParams} />
    </div>
  );
}
