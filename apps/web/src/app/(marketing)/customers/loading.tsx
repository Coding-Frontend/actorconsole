import { HomeGridSection } from "@/components/marketing/home-grid";
import { PageHeroSkeleton, SkeletonLines } from "@/components/marketing/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main
      role="status"
      aria-label="Loading page"
      aria-busy="true"
      className="marketing-page flex-1"
    >
      <PageHeroSkeleton tone="ink" />

      <HomeGridSection
        className="bg-fog"
        frameClassName="px-6 sm:px-8 lg:px-12 pb-16 pt-12 sm:pb-20 sm:pt-16"
      >
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="border-border bg-card border p-6 sm:p-8">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="mt-5 h-6 w-44" />
              <SkeletonLines count={3} className="mt-3" />
            </div>
          ))}
        </div>
      </HomeGridSection>

      <HomeGridSection
        className="semantic-accent-panel text-foreground"
        frameClassName="px-6 sm:px-8 lg:px-12 py-20 sm:py-28"
      >
        <div className="mx-auto max-w-3xl text-center">
          <Skeleton className="bg-foreground/10 mx-auto h-10 w-72" />
          <Skeleton className="bg-foreground/10 mx-auto mt-4 h-4 w-96 max-w-full" />
          <div className="mt-8 flex justify-center gap-3">
            <Skeleton className="bg-foreground/10 h-11 w-44 rounded-md" />
            <Skeleton className="bg-foreground/10 h-11 w-32 rounded-md" />
          </div>
        </div>
      </HomeGridSection>
    </main>
  );
}
