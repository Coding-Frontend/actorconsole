import { HomeGridSection } from "@/components/marketing/home-grid";
import { PageHeroSkeleton, SkeletonLines } from "@/components/marketing/page-skeleton";

export default function Loading() {
  return (
    <main role="status" aria-label="Loading extension privacy" aria-busy="true">
      <PageHeroSkeleton tone="fog" />
      <HomeGridSection className="bg-fog" frameClassName="px-6 py-12 sm:px-8 lg:p-12">
        <div
          aria-hidden="true"
          className="border-border bg-card mx-auto max-w-4xl border p-6 sm:p-9"
        >
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonLines key={index} count={5} className="mb-8 last:mb-0" />
          ))}
        </div>
      </HomeGridSection>
    </main>
  );
}
