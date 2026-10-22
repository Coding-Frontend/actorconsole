import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      {/* All-notifications panel */}
      <div className="border-border/80 bg-card overflow-hidden rounded-md border">
        <div className="border-border/80 flex items-center gap-2 border-b px-5 py-4">
          <Skeleton className="h-4 w-4 rounded-sm" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ml-auto h-5 w-16 rounded-full" />
        </div>
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index}>
            {index === 0 || index === 3 || index === 6 ? (
              <Skeleton className="mx-5 mt-4 h-2.5 w-20" />
            ) : null}
            <div className="border-border/50 flex items-start gap-4 border-b px-5 py-4 last:border-0">
              <Skeleton className="mt-0.5 h-8 w-8 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-2.5 w-16" />
              </div>
              {index % 3 === 0 && <Skeleton className="h-2 w-2 rounded-full" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
