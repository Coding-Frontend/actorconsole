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
      <HomeGridSection
        className="bg-fog"
        frameClassName="flex justify-center px-6 sm:px-8 lg:px-12 pb-24 pt-12"
      >
        <div className="border-border bg-card w-full max-w-md border p-6 sm:p-8">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-[82%]" />
          <Skeleton className="mt-6 h-11 w-full rounded-md" />
          <Skeleton className="mt-3 h-3 w-48" />
        </div>
      </HomeGridSection>
    </main>
  );
}
