import { PublicGridSection } from "@/components/marketing/public-grid-section";
import { SkeletonLines } from "@/components/marketing/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main role="status" aria-label="Loading changelog article" aria-busy="true">
      <PublicGridSection frameClassName="py-12 sm:py-16">
        <div className="mx-auto max-w-4xl" aria-hidden="true">
          <Skeleton className="mb-10 h-4 w-40" />
          <Skeleton className="h-10 w-full max-w-2xl" />
          <Skeleton className="mt-4 h-3 w-48" />
          <SkeletonLines className="mt-10" count={8} />
          <Skeleton className="mt-8 h-56 w-full" />
          <SkeletonLines className="mt-8" count={5} />
        </div>
      </PublicGridSection>
    </main>
  );
}
