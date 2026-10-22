import { Skeleton, SkeletonCard, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Back button */}
      <Skeleton className="h-8 w-32" />
      <SkeletonPageHeader />

      {/* 3-column grid: Profile, Stats, Actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        <SkeletonCard lines={6} />
        <SkeletonCard>
          <div className="mb-4">
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="border-border/80 bg-muted/30 rounded-md border p-3">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="mt-1 h-5 w-8" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard lines={4} />
      </div>
    </div>
  );
}
