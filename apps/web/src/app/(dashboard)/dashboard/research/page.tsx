import { ActorResearchView } from "@/components/intelligence/actor-research-view";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { researchFilters } from "@/lib/actor-research";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="space-y-8">
      <DashboardPageHeader
        context="Research"
        title="Actor research"
        description="Find public Actors, compare usage, and save competitors to your workspace watchlist."
      />
      <ActorResearchView filters={researchFilters(await searchParams)} path="/dashboard/research" />
    </div>
  );
}
