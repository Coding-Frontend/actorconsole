import { Skeleton, SkeletonChart, SkeletonStatCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Usage-cost chart */}
      <SkeletonChart />

      {/* Budget manager / insight strip */}
      <div className="border-border/80 bg-card rounded-md border p-5 sm:p-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-border/50 border p-3">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-2 h-5 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Highest-cost insight */}
      <div className="border-signal-orange/20 bg-signal-orange/[0.03] flex items-center gap-2 rounded-md border px-5 py-3">
        <Skeleton className="h-4 w-4 rounded-sm" />
        <Skeleton className="h-3 w-full max-w-xl" />
      </div>

      {/* Per-actor breakdown */}
      <div className="border-border/80 bg-card rounded-md border p-5 sm:p-6">
        <Skeleton className="h-5 w-40" />
        <div className="mt-5 space-y-5">
          <Skeleton className="h-8 w-full rounded-sm" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border-border/50 flex items-center gap-4 border-t pt-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-2.5 w-28" />
                <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
              </div>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
