import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section
      role="status"
      aria-label="Loading documentation"
      aria-busy="true"
      className="docs-main-panel min-w-0"
    >
      <div aria-hidden="true">
        <div className="docs-article-header flex items-start gap-4">
          <Skeleton className="mt-1 h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="mt-4 h-12 w-full max-w-2xl" />
            <Skeleton className="mt-2 h-12 w-2/3 max-w-xl" />
          </div>
        </div>
        <div className="docs-content space-y-6">
          <Skeleton className="h-4 w-full max-w-2xl" />
          <Skeleton className="h-4 w-4/5 max-w-xl" />
          <div className="docs-grid grid sm:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index}>
                <Skeleton className="h-6 w-6" />
                <Skeleton className="mt-3 h-5 w-40" />
                <Skeleton className="mt-5 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-4/5" />
              </div>
            ))}
          </div>
          <Skeleton className="h-6 w-40" />
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex gap-3">
              <Skeleton className="h-4 w-4 shrink-0" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
        <div className="docs-pagination grid sm:grid-cols-2">
          <div>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-4 w-48" />
          </div>
          <div>
            <Skeleton className="ml-auto h-3 w-28" />
            <Skeleton className="ml-auto mt-3 h-4 w-48" />
          </div>
        </div>
        <div className="docs-help flex flex-wrap justify-between gap-4">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
    </section>
  );
}
