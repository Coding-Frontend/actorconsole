import { HomeGridSection } from "@/components/marketing/home-grid";
import { PageHeroSkeleton } from "@/components/marketing/page-skeleton";
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

      <HomeGridSection className="bg-fog" frameClassName="px-6 sm:px-8 lg:px-12 pb-24 pt-12">
        <div className="mx-auto max-w-3xl">
          <Skeleton className="h-12 w-full rounded-md" />
          <div className="mt-10 space-y-10">
            {Array.from({ length: 3 }).map((_, groupIndex) => (
              <div key={groupIndex}>
                <div className="border-border mb-4 flex items-center justify-between border-b pb-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <div className="divide-border border-border divide-y border-y">
                  {Array.from({ length: groupIndex === 0 ? 4 : 3 }).map((_, index) => (
                    <div key={index} className="flex items-center justify-between gap-4 py-5">
                      <Skeleton className={`h-4 ${index % 2 ? "w-4/5" : "w-full"}`} />
                      <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </HomeGridSection>
    </main>
  );
}
