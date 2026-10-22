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
        <div className="border-border mb-10 flex flex-col gap-5 border-b pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Skeleton className="h-3 w-36" />
            <Skeleton className="mt-4 h-9 w-80 max-w-full" />
          </div>
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-20 rounded-full" />
          ))}
          <Skeleton className="ml-auto h-3 w-20 self-center" />
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="border-border bg-card flex flex-col overflow-hidden border">
              <Skeleton className="aspect-[1.55] w-full rounded-none" />
              <div className="flex-1 space-y-3 p-5">
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
                <Skeleton className="h-6 w-4/5" />
                <SkeletonLines count={3} />
                <div className="border-border flex items-center justify-between border-t pt-4">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-border mt-10 flex items-center justify-between border-t pt-6">
          <Skeleton className="h-9 w-24 rounded-md" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
      </HomeGridSection>

      <HomeGridSection
        className="bg-fog"
        frameClassName="grid gap-12 px-6 sm:px-8 lg:grid-cols-[0.85fr_1fr] lg:gap-20 lg:px-12 py-16 sm:py-20 lg:py-24"
      >
        <div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-5 h-12 w-80 max-w-full" />
          <Skeleton className="mt-5 h-4 w-full max-w-md" />
          <Skeleton className="mt-2 h-4 w-[88%] max-w-md" />
          <div className="border-border mt-9 space-y-3 border-t pt-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-3 w-64 max-w-[80%]" />
              </div>
            ))}
          </div>
        </div>
        <div className="border-border bg-card border p-6 sm:p-10">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-5 h-10 w-64" />
          <Skeleton className="mt-3 h-3 w-40" />
          <Skeleton className="mt-8 h-12 w-full rounded-md" />
          <Skeleton className="mt-4 h-3 w-64" />
        </div>
      </HomeGridSection>
    </main>
  );
}
