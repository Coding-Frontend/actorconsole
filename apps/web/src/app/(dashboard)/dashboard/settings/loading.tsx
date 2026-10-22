import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Profile panel */}
      <div className="border-border/80 bg-card rounded-md border p-5">
        <Skeleton className="mb-5 h-5 w-16" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="border-border/30 flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
            >
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-5 w-32" />
            </div>
          ))}
        </div>
      </div>

      {/* Apify credentials panel */}
      <div className="border-border/80 bg-card rounded-md border p-5">
        <Skeleton className="mb-5 h-5 w-28" />
        <Skeleton className="h-9 w-full max-w-md" />
      </div>

      {/* Billing card */}
      <div className="border-border/80 bg-card rounded-md border p-5">
        <Skeleton className="mb-3 h-5 w-16" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
