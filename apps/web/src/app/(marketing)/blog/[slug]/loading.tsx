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
        frameClassName="px-6 sm:px-8 lg:px-12 py-16 sm:py-20 lg:py-24"
      >
        <article className="mx-auto max-w-3xl">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="mb-8 space-y-3">
              {index === 0 ? <Skeleton className="h-8 w-64" /> : <Skeleton className="h-6 w-52" />}
              <SkeletonLines count={index === 0 ? 4 : 5} />
            </div>
          ))}
          <div className="border-border bg-card my-10 border p-6">
            <Skeleton className="h-5 w-48" />
            <SkeletonLines count={3} className="mt-4" />
          </div>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="mb-8 space-y-3">
              <Skeleton className="h-6 w-56" />
              <SkeletonLines count={4} />
            </div>
          ))}
        </article>
      </HomeGridSection>

      <HomeGridSection
        className="bg-fog"
        frameClassName="grid gap-12 px-6 sm:px-8 lg:grid-cols-[0.85fr_1fr] lg:gap-20 lg:px-12 py-16 sm:py-20"
      >
        <Skeleton className="h-12 w-80 max-w-full" />
        <div className="border-border bg-card border p-6 sm:p-10">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-3 h-3 w-40" />
          <Skeleton className="mt-8 h-12 w-full rounded-md" />
        </div>
      </HomeGridSection>
    </main>
  );
}
