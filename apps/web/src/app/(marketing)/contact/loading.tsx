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
        frameClassName="grid gap-12 px-6 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:px-12 pb-20 pt-12"
      >
        <div className="space-y-6">
          <Skeleton className="h-7 w-44" />
          <SkeletonLines count={3} />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="border-border bg-card border p-6">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="mt-4 h-4 w-28" />
                <SkeletonLines count={3} className="mt-1" />
                <Skeleton className="mt-3 h-3 w-36" />
              </div>
            ))}
          </div>
          <div className="border-border bg-card flex items-start gap-4 border p-6">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-40" />
              <SkeletonLines count={3} className="mt-2" />
            </div>
          </div>
          <div className="border-border bg-fog flex items-center justify-between border p-5">
            <Skeleton className="h-3 w-56 max-w-[70%]" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-3 w-24" />
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </div>

        <div className="border-border bg-card border p-8 shadow-lg sm:p-10">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-1 h-3 w-64" />
          <div className="mt-6 space-y-5">
            <Skeleton className="h-11 w-full rounded-md" />
            <Skeleton className="h-11 w-full rounded-md" />
            <Skeleton className="h-11 w-full rounded-md" />
            <Skeleton className="h-32 w-full rounded-md" />
            <Skeleton className="ml-auto h-11 w-32 rounded-md" />
          </div>
        </div>
      </HomeGridSection>
    </main>
  );
}
