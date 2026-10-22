import { Suspense } from "react";
import type { Metadata } from "next";
import { ActorResearchView } from "@/components/intelligence/actor-research-view";
import { researchFilters } from "@/lib/actor-research";
import { PublicGridSection } from "@/components/marketing/public-grid-section";
import { ResearchResultsSkeleton } from "@/components/marketing/public-data-skeleton";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Actor discovery & trending",
  description: "Find public Apify Actors, compare demand, inspect trends, and watch competitors.",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = researchFilters(await searchParams);
  return (
    <main>
      <PublicGridSection>
        <h1 className="font-display-tight max-w-3xl text-4xl sm:text-5xl">
          Find your next Actor opportunity.
        </h1>
        <p className="text-muted-foreground mt-5 max-w-[65ch] text-lg leading-7">
          Explore public listings, compare usage, and follow the Actors that matter to your
          business.
        </p>
      </PublicGridSection>
      <PublicGridSection>
        <Suspense key={JSON.stringify(filters)} fallback={<ResearchResultsSkeleton />}>
          <ActorResearchView filters={filters} path="/research" />
        </Suspense>
      </PublicGridSection>
    </main>
  );
}
