import { Skeleton, SkeletonCard, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Back button */}
      <Skeleton className="h-8 w-36" />

      <SkeletonPageHeader titleWidth="w-48" descriptionWidth="w-48" />

      {/* Detail cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} lines={4} />
        ))}
      </div>

      {/* Activity section */}
      <SkeletonCard lines={6} />
    </div>
  );
}
