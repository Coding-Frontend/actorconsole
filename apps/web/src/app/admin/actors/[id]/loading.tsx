import { Skeleton, SkeletonCard, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Back button */}
      <Skeleton className="h-8 w-28" />
      <SkeletonPageHeader />

      {/* Stat cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} lines={3} />
        ))}
      </div>

      {/* Detail sections */}
      <SkeletonCard lines={6} />
      <SkeletonCard lines={4} />
    </div>
  );
}
