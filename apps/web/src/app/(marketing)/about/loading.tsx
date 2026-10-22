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

      <HomeGridSection className="bg-mist" frameClassName="px-6 sm:px-8 lg:px-12 py-16 sm:py-20">
        <div className="border-border bg-card mx-auto max-w-3xl border p-6 sm:p-8 lg:p-10">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="mt-2 h-4 w-full max-w-xl" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="h-1.5 w-1.5 shrink-0 rounded-full" />
                <Skeleton className={`h-3 ${index % 3 === 0 ? "w-full" : "w-4/5"}`} />
              </div>
            ))}
          </div>
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
            <Skeleton className="bg-foreground/10 h-11 w-40 rounded-md" />
            <Skeleton className="bg-foreground/10 h-11 w-32 rounded-md" />
          </div>
        </div>
      </HomeGridSection>
    </main>
  );
}
