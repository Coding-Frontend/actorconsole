import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { AuthLoadingFrame } from "@/components/auth/auth-frame";

export default function Loading() {
  return (
    <AuthLoadingFrame>
      <div className="space-y-7">
        <div className="space-y-2">
          {/* Logo */}
          <Skeleton className="h-3 w-44" />
          <Skeleton className="mt-4 h-12 w-full max-w-sm" />
          <Skeleton className="h-12 w-[72%] max-w-xs" />
          <Skeleton className="mt-4 h-3.5 w-full max-w-sm" />
        </div>

        {/* Form card */}
        <SkeletonCard>
          <div className="space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-56" />
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-12" />
              <Skeleton className="h-9 w-full" />
            </div>
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-3 w-36" />
          </div>
        </SkeletonCard>

        {/* Social signup */}
        <div className="space-y-3">
          <div className="relative">
            <Skeleton className="h-px w-full" />
            <Skeleton className="absolute left-1/2 top-1/2 h-3 w-16 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
    </AuthLoadingFrame>
  );
}
