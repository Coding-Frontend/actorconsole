import { Skeleton, SkeletonCard, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Back button */}
      <Skeleton className="h-8 w-24" />
      <SkeletonPageHeader />

      {/* Editor form */}
      <SkeletonCard>
        <div className="space-y-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="ml-auto h-9 w-32 rounded-md" />
        </div>
      </SkeletonCard>
    </div>
  );
}
