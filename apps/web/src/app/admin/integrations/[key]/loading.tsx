import { Skeleton, SkeletonCard, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Back button */}
      <Skeleton className="h-8 w-24" />
      <SkeletonPageHeader />

      {/* Config panel */}
      <SkeletonCard lines={4} />
      <SkeletonCard lines={6} />
    </div>
  );
}
