import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />

      <div className="flex gap-6 border-b pb-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-28" />
        ))}
      </div>
      <Skeleton className="h-12 w-full sm:w-96" />
      <div
        className="border-border bg-card rounded-sm border p-6"
        role="status"
        aria-label="Loading payment gateway settings"
      >
        <div className="flex items-center gap-3">
          <Skeleton className="size-11" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="mt-6 h-16 w-full" />
        <div className="mt-8 grid gap-8 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-8 h-14 w-full" />
      </div>
    </div>
  );
}
