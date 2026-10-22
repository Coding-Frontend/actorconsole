import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* KeywordResearch panel: search first, then optional watchlist/results. */}
      <SkeletonCard className="rounded-sm" lines={4}>
        <div className="space-y-5">
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-24 rounded-md" />
          </div>
          <div className="border-border/40 border p-3">
            <Skeleton className="mb-2 h-3 w-28" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-28 rounded-full" />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2.5 w-48" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="border-border/50 flex items-start justify-between gap-4 border-t py-3"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-48 max-w-full" />
                  <Skeleton className="h-2.5 w-32" />
                  <Skeleton className="h-2.5 w-full max-w-md" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </SkeletonCard>
    </div>
  );
}
