import { Skeleton, SkeletonCard, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Back button */}
      <Skeleton className="h-8 w-28" />

      <SkeletonPageHeader titleWidth="w-40" descriptionWidth="w-48" />

      {/* Detail cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </div>

      {/* Payload */}
      <SkeletonCard lines={6} />
    </div>
  );
}
