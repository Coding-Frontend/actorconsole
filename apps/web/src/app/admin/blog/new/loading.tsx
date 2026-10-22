import { Skeleton, SkeletonCard, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />

      {/* Editor form */}
      <SkeletonCard>
        <div className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>
      </SkeletonCard>
    </div>
  );
}
