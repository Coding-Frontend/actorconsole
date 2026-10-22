import { Skeleton } from "@/components/ui/skeleton";
import {
  HomeGridCell,
  HomeGridDivider,
  HomeGridRow,
  HomeGridSection,
} from "@/components/marketing/home-grid";
import { SkeletonLines } from "@/components/marketing/page-skeleton";
import styles from "@/components/marketing/hero.module.css";

const sections = [
  "Tools & integrations",
  "Core features",
  "How it works",
  "MCP server",
  "Plans & pricing",
  "Get started",
  "The builder's digest",
];

export default function Loading() {
  return (
    <div
      className="home-grid-page flex min-h-screen flex-col"
      role="status"
      aria-label="Loading ActorConsole"
      aria-busy="true"
    >
      <header className="marketing-header border-border border-b border-dashed">
        <div
          className="marketing-header-inner mx-auto flex items-center justify-between gap-6 px-6 sm:px-8 lg:px-12"
          aria-hidden="true"
        >
          <Skeleton className="h-8 w-40" />
          <div className="hidden gap-6 lg:flex">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-3 w-16" />
            ))}
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <span className="marketing-header-frame-marks" aria-hidden="true" />
      </header>
      <main className="flex-1" aria-hidden="true">
        <HomeGridSection>
          <div className={styles.layout}>
            <div className={styles.copy}>
              <Skeleton className="h-3 w-48" />
              <div className="mt-6 space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-4/5" />
              </div>
              <SkeletonLines count={4} className="mt-7" />
              <div className="mt-8 flex flex-wrap gap-3">
                <Skeleton className="h-11 w-36" />
                <Skeleton className="h-11 w-44" />
              </div>
            </div>
            <div className={styles.visual}>
              <div className={styles.visualCenter}>
                <div className={`${styles.workflowPanel} w-full`}>
                  <div className="border-border border-b p-6">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="mt-3 h-6 w-48" />
                  </div>
                  {Array.from({ length: 3 }, (_, index) => (
                    <div
                      key={index}
                      className="border-border flex items-center gap-4 border-b p-6 last:border-b-0"
                    >
                      <Skeleton className="h-10 w-10 shrink-0" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </HomeGridSection>
        {sections.map((title, index) => (
          <div key={title}>
            <HomeGridDivider number={String(index + 1).padStart(2, "0")} title={title} />
            <HomeGridSection>
              <HomeGridRow>
                <HomeGridCell className="col-span-4 px-6 py-12 sm:px-8 lg:p-12">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="mt-5 h-10 w-full" />
                  <SkeletonLines className="mt-6" />
                </HomeGridCell>
                <HomeGridCell className="col-span-8 px-6 py-12 sm:px-8 lg:p-12">
                  <Skeleton className="h-48 w-full" />
                  <SkeletonLines className="mt-6" />
                </HomeGridCell>
              </HomeGridRow>
            </HomeGridSection>
          </div>
        ))}
      </main>
      <footer className="home-grid-footer" aria-hidden="true">
        <div className="home-grid-frame grid gap-8 px-6 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-5 lg:p-12">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index}>
              <Skeleton className="h-5 w-32" />
              <SkeletonLines className="mt-6" count={4} />
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
