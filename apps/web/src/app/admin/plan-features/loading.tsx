import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <SkeletonPageHeader titleWidth="w-56" descriptionWidth="w-96" />
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="border-border/80 bg-card overflow-hidden rounded-md border">
            <div className="border-border/80 border-b p-5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-8 w-32" />
              <Skeleton className="mt-2 h-3 w-40" />
            </div>
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((__, featureIndex) => (
                <div
                  key={featureIndex}
                  className="border-border/50 flex items-center gap-3 border-b pb-3 last:border-0"
                >
                  <Skeleton className="h-4 w-4 rounded-sm" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
