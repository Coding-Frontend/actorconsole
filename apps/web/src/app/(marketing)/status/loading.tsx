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

      <HomeGridSection className="bg-fog" frameClassName="px-6 sm:px-8 lg:px-12 pt-12">
        <div className="mx-auto max-w-3xl space-y-10">
          <div className="space-y-4">
            <Skeleton className="h-6 w-36" />
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="border-signal-orange/50 bg-card border p-6">
                <div className="flex items-start gap-3">
                  <Skeleton className="mt-0.5 h-5 w-5 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-5 w-56" />
                    <div className="mt-2 flex gap-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                      <Skeleton className="h-3 w-24 self-center" />
                    </div>
                  </div>
                </div>
                <SkeletonLines count={2} className="mt-5 pl-8" />
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <div className="border-border bg-card border p-5 sm:p-6">
              <Skeleton className="h-4 w-40" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="border-border bg-fog flex items-center justify-between border px-4 py-3"
                  >
                    <Skeleton className="h-3 w-36" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-2 w-2 rounded-full" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
              <Skeleton className="mx-auto mt-4 h-3 w-64" />
            </div>
          </div>
        </div>
      </HomeGridSection>
      <div className="bg-mist h-20" />
    </main>
  );
}
