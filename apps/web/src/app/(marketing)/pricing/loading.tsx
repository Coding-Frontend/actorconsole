import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";
import { PageHeroSkeleton, SkeletonLines } from "@/components/marketing/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main
      className="marketing-page flex-1"
      role="status"
      aria-label="Loading pricing"
      aria-busy="true"
    >
      <PageHeroSkeleton tone="paper" />
      <HomeGridSection className="bg-fog/35">
        <HomeGridRow className="home-grid-intro-row" aria-hidden="true">
          <HomeGridCell className="col-span-5 px-6 py-14 sm:px-8 sm:py-16 lg:p-12">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-5 h-12 w-full" />
            <Skeleton className="mt-2 h-12 w-4/5" />
          </HomeGridCell>
          <HomeGridCell className="col-span-7 flex items-end px-6 py-14 sm:px-8 sm:py-16 lg:p-12">
            <SkeletonLines className="w-full max-w-xl" />
          </HomeGridCell>
        </HomeGridRow>
        <HomeGridRow aria-hidden="true">
          {Array.from({ length: 2 }, (_, index) => (
            <HomeGridCell key={index} className="col-span-6 px-6 py-10 sm:px-8 lg:p-10">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="mt-4 h-9 w-28" />
              <Skeleton className="mt-7 h-5 w-56" />
              <Skeleton className="mt-3 h-3 w-44" />
              <SkeletonLines className="mt-4" />
              <div className="border-border mt-7 border-t pt-5">
                <SkeletonLines count={index === 0 ? 5 : 8} />
              </div>
              <Skeleton className="mt-8 h-11 w-full" />
            </HomeGridCell>
          ))}
        </HomeGridRow>
      </HomeGridSection>
      <HomeGridSection>
        <HomeGridRow aria-hidden="true">
          <HomeGridCell className="col-span-8 px-6 py-14 sm:px-8 sm:py-16 lg:p-12">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="mt-5 h-12 w-full max-w-xl" />
            <SkeletonLines className="mt-5 max-w-2xl" />
          </HomeGridCell>
          <HomeGridCell className="bg-card/40 col-span-4 flex flex-col justify-end px-6 py-12 sm:px-8 lg:p-10">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="mt-6 h-11 w-full" />
          </HomeGridCell>
        </HomeGridRow>
      </HomeGridSection>
    </main>
  );
}
