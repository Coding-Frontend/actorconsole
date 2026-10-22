import { HomeGridSection } from "@/components/marketing/home-grid";
import { PageHeroSkeleton, SkeletonLines } from "@/components/marketing/page-skeleton";
import { featureMeta } from "@/components/marketing/features/features-meta";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main
      role="status"
      aria-label="Loading page"
      aria-busy="true"
      className="marketing-page flex-1"
    >
      <PageHeroSkeleton />

      <HomeGridSection
        className="bg-mist"
        frameClassName="px-6 sm:px-8 lg:px-12 pb-16 pt-8 sm:pb-24 sm:pt-12"
      >
        <div className="mb-10 space-y-4">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-12 w-80 max-w-full" />
          <SkeletonLines count={2} className="max-w-xl" />
        </div>

        <div className="border-border border-t">
          {featureMeta.map((feature) => (
            <div key={feature.id} className="border-border flex gap-8 border-b py-12 sm:py-16">
              <div className="w-12 shrink-0 space-y-5">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-10 w-10 rounded-full" />
              </div>
              <div className="min-w-0 flex-1">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="mt-5 h-9 w-72 max-w-full" />
                <SkeletonLines count={3} className="mt-5 max-w-3xl" />
              </div>
            </div>
          ))}
        </div>
      </HomeGridSection>

      <HomeGridSection
        className="semantic-accent-panel text-foreground"
        frameClassName="px-6 sm:px-8 lg:px-12 py-20 sm:py-28"
      >
        <Skeleton className="bg-foreground/10 h-3 w-28" />
        <Skeleton className="bg-foreground/10 mt-5 h-12 w-96 max-w-full" />
        <Skeleton className="bg-foreground/10 mt-5 h-4 w-96 max-w-full" />
        <div className="mt-8 flex gap-3">
          <Skeleton className="bg-foreground/10 h-11 w-36 rounded-md" />
          <Skeleton className="bg-foreground/10 h-11 w-32 rounded-md" />
        </div>
      </HomeGridSection>
    </main>
  );
}
