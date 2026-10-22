import { Skeleton, SkeletonChart } from "@/components/ui/skeleton";
import { PublicGridSection } from "./public-grid-section";
import { SkeletonLines } from "./page-skeleton";
import { HomeGridSection } from "./home-grid";

function IntroSkeleton({
  breadcrumb = false,
  links = false,
}: {
  breadcrumb?: boolean;
  links?: boolean;
}) {
  return (
    <>
      {breadcrumb ? <Skeleton className="mb-8 h-4 w-40" /> : null}
      <Skeleton className="h-10 w-full max-w-2xl sm:h-12" />
      <Skeleton className="mt-5 h-4 w-full max-w-3xl" />
      <Skeleton className="mt-2 h-4 w-2/3 max-w-xl" />
      {links ? (
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-4 w-32" />
          ))}
        </div>
      ) : null}
    </>
  );
}

export function LeaderboardControlsSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr_auto]">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** Shares the real table's horizontal scrolling instead of widening the page. */
export function LeaderboardTableSkeleton() {
  return (
    <div role="status" aria-label="Loading leaderboard" aria-busy="true">
      <div aria-hidden="true">
        <div className="mb-3 flex flex-wrap justify-between gap-3">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-3 w-52" />
        </div>
        <div className="border-border overflow-x-auto border-y">
          <div className="min-w-[760px]">
            <div className="border-border grid grid-cols-[2rem_minmax(14rem,2fr)_repeat(5,minmax(4rem,1fr))] gap-4 border-b px-3 py-4">
              {Array.from({ length: 7 }, (_, index) => (
                <Skeleton key={index} className="h-3 w-full max-w-24" />
              ))}
            </div>
            {Array.from({ length: 6 }, (_, row) => (
              <div
                key={row}
                className="border-border/60 grid grid-cols-[2rem_minmax(14rem,2fr)_repeat(5,minmax(4rem,1fr))] items-center gap-4 border-b px-3 py-5 last:border-0"
              >
                <Skeleton className="h-4 w-5" />
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-4 w-16" />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 flex justify-between gap-3">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
    </div>
  );
}

export function LeaderboardPageSkeleton() {
  return (
    <main
      className="bg-background"
      role="status"
      aria-label="Loading builder leaderboard"
      aria-busy="true"
    >
      <PublicGridSection>
        <div aria-hidden="true">
          <Skeleton className="h-9 w-full max-w-lg" />
          <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
        </div>
      </PublicGridSection>
      <PublicGridSection>
        <div className="mb-6">
          <LeaderboardControlsSkeleton />
        </div>
        <LeaderboardTableSkeleton />
      </PublicGridSection>
    </main>
  );
}

export function ResearchResultsSkeleton() {
  return (
    <div role="status" aria-label="Loading Actor research" aria-busy="true">
      <div aria-hidden="true" className="space-y-8">
        <div className="border-border grid gap-4 border-y py-5 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="min-w-0 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full min-w-16" />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="divide-border border-border divide-y border-y">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <Skeleton className="h-5 w-72" />
                <Skeleton className="mt-2 h-3 w-40" />
                <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Skeleton className="h-12 w-28" />
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResearchPageSkeleton() {
  return (
    <main role="status" aria-label="Loading Actor research page" aria-busy="true">
      <PublicGridSection>
        <div aria-hidden="true">
          <IntroSkeleton links />
        </div>
      </PublicGridSection>
      <PublicGridSection>
        <ResearchResultsSkeleton />
      </PublicGridSection>
    </main>
  );
}

export function ComparisonPageSkeleton() {
  return (
    <main className="bg-background" role="status" aria-label="Loading comparison" aria-busy="true">
      <HomeGridSection frameClassName="min-w-0 px-5 pb-16 pt-6 sm:px-8 sm:pt-8 lg:px-12 lg:pt-10">
        <div aria-hidden="true" className="mb-6 sm:mb-8">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-5 h-8 w-full max-w-2xl sm:mt-6 lg:h-10" />
          <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
        </div>
        <div aria-hidden="true" className="space-y-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-full lg:max-w-md" />
          </div>
          <div className="border-border grid border sm:grid-cols-2">
            {Array.from({ length: 2 }, (_, column) => (
              <div
                key={column}
                className="border-border min-w-0 border-b p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:p-6 sm:last:border-r-0"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
                  <Skeleton className="h-5 w-48" />
                </div>
                <Skeleton className="mt-5 h-3 w-40" />
                <div className="divide-border mt-6 divide-y">
                  {Array.from({ length: 8 }, (_, row) => (
                    <div key={row} className="flex flex-wrap justify-between gap-4 py-4">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-4 w-20" />
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

export type PublicToolKind = "pricing" | "seo" | "sdk";

export function ToolContentSkeleton({ kind }: { kind: PublicToolKind }) {
  return (
    <div
      role="status"
      aria-label={`Loading ${kind === "sdk" ? "SDK guide" : kind === "seo" ? "listing audit" : "pricing calculator"}`}
      aria-busy="true"
    >
      <div aria-hidden="true">
        {kind === "sdk" ? (
          <div className="space-y-10">
            <div>
              <Skeleton className="h-6 w-64" />
              <SkeletonLines className="mt-5 max-w-3xl" />
              <Skeleton className="mt-5 h-10 w-48" />
            </div>
            <div className="grid gap-8 xl:grid-cols-2">
              {Array.from({ length: 2 }, (_, index) => (
                <div key={index} className="min-w-0">
                  <Skeleton className="mb-4 h-6 w-44" />
                  <div className="border-border bg-muted/25 border p-6">
                    <SkeletonLines count={10} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : kind === "seo" ? (
          <div className="space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-32" />
            </div>
            <div className="border-border border-y py-8">
              <Skeleton className="h-6 w-56" />
              <SkeletonLines className="mt-5 max-w-2xl" />
            </div>
          </div>
        ) : (
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="space-y-6">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index}>
                  <Skeleton className="mb-2 h-4 w-40" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
            <div className="border-border border-y py-6">
              <Skeleton className="h-6 w-48" />
              <div className="divide-border mt-6 divide-y">
                {Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className="flex justify-between gap-4 py-4">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ToolPageSkeleton({ kind }: { kind: PublicToolKind }) {
  return (
    <main role="status" aria-label="Loading public tool" aria-busy="true">
      <PublicGridSection>
        <div aria-hidden="true">
          <IntroSkeleton breadcrumb={kind !== "sdk"} />
        </div>
      </PublicGridSection>
      <PublicGridSection>
        <ToolContentSkeleton kind={kind} />
      </PublicGridSection>
    </main>
  );
}

export function CatalogDetailSkeleton({ kind }: { kind: "builder" | "actor" }) {
  return (
    <main className="bg-mist" role="status" aria-label={`Loading ${kind} profile`} aria-busy="true">
      <PublicGridSection>
        <div aria-hidden="true">
          <Skeleton className="mb-8 h-3 w-48" />
          <div className="flex flex-col justify-between gap-6 sm:flex-row">
            <div className="flex min-w-0 items-center gap-4">
              <Skeleton className="h-20 w-20 shrink-0 rounded-lg" />
              <div className="min-w-0 space-y-3">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
            </div>
          </div>
          <SkeletonLines className="mt-6 max-w-3xl" />
          <div
            className={`border-border mt-8 grid grid-cols-2 gap-px overflow-hidden border sm:grid-cols-3 ${kind === "builder" ? "xl:grid-cols-7" : "xl:grid-cols-6"}`}
          >
            {Array.from({ length: kind === "builder" ? 7 : 6 }, (_, index) => (
              <div key={index} className="bg-card min-w-0 p-4 sm:p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-8 w-28" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
            ))}
          </div>
          {kind === "builder" ? (
            <div className="border-border mt-7 grid grid-cols-2 gap-5 border-t pt-7 sm:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="min-w-0 space-y-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : null}
          <div className="border-border mt-7 grid gap-5 border-t pt-7 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="min-w-0">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="mt-3 h-7 w-32" />
              </div>
            ))}
          </div>
        </div>
      </PublicGridSection>
      <PublicGridSection className="bg-fog/35" frameClassName="py-12 sm:py-14">
        <div
          aria-hidden="true"
          className={
            kind === "actor" ? "grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,.7fr)]" : ""
          }
        >
          <div className="min-w-0">
            <Skeleton className="mb-6 h-8 w-64" />
            <SkeletonChart />
          </div>
          {kind === "actor" ? (
            <div className="border-border min-w-0 border p-5 sm:p-7">
              <Skeleton className="h-3 w-32" />
              <div className="mt-7 space-y-7">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="flex justify-between gap-4">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </PublicGridSection>
      <PublicGridSection frameClassName="py-12 sm:py-16 lg:py-20">
        {kind === "builder" ? (
          <>
            <div aria-hidden="true" className="mb-6">
              <Skeleton className="mb-6 h-8 w-48" />
              <LeaderboardControlsSkeleton />
            </div>
            <LeaderboardTableSkeleton />
          </>
        ) : (
          <div aria-hidden="true" className="grid gap-6 lg:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index} className="border-border min-w-0 border p-5 sm:p-7">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="mt-3 h-8 w-56" />
                <SkeletonLines className="mt-6" count={8} />
              </div>
            ))}
          </div>
        )}
      </PublicGridSection>
    </main>
  );
}
