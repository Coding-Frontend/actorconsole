import { AuthLoadingFrame } from "@/components/auth/auth-frame";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AuthLoadingFrame>
      <div className="space-y-7">
        <div className="space-y-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="mt-4 h-12 w-full max-w-sm" />
          <Skeleton className="h-12 w-[68%] max-w-xs" />
          <Skeleton className="mt-4 h-3.5 w-full max-w-sm" />
        </div>
        <SkeletonCard>
          <div className="space-y-5">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[86%]" />
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-9 w-full" />
            </div>
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </SkeletonCard>
        <Skeleton className="mx-auto h-3 w-40" />
      </div>
    </AuthLoadingFrame>
  );
}
