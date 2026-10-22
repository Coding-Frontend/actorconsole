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
      <PageHeroSkeleton tone="fog" />

      <HomeGridSection
        className="bg-fog"
        frameClassName="grid gap-8 px-6 sm:px-8 lg:grid-cols-[220px_1fr] lg:px-12 py-10 sm:py-14"
      >
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-3">
            <Skeleton className="h-3 w-20" />
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className={`h-3 ${index % 2 ? "w-28" : "w-36"}`} />
            ))}
          </div>
        </aside>
        <article className="border-border space-y-8 border-l pl-5 sm:pl-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="space-y-3">
              <Skeleton className={`h-7 ${index % 2 ? "w-56" : "w-72"}`} />
              <SkeletonLines count={index === 0 ? 5 : 4} />
            </div>
          ))}
        </article>
      </HomeGridSection>
    </main>
  );
}
