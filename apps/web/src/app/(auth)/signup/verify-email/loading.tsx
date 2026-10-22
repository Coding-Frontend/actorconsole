import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { AuthLoadingFrame } from "@/components/auth/auth-frame";

export default function Loading() {
  return (
    <AuthLoadingFrame>
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="mt-4 h-12 w-full max-w-sm" />
          <Skeleton className="h-12 w-[72%] max-w-xs" />
          <Skeleton className="mt-4 h-3.5 w-full max-w-sm" />
        </div>
        <SkeletonCard>
          <div className="space-y-4 text-center">
            <Skeleton className="mx-auto h-12 w-12 rounded-full" />
            <Skeleton className="mx-auto h-6 w-48" />
            <Skeleton className="mx-auto h-3 w-64" />
            <Skeleton className="mx-auto h-3 w-56" />
          </div>
        </SkeletonCard>
      </div>
    </AuthLoadingFrame>
  );
}
