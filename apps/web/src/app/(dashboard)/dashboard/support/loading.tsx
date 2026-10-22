import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      {/* Panel with table */}
      <div className="border-border/80 bg-card rounded-md border">
        {/* Panel header */}
        <div className="border-border/40 flex items-center gap-2 border-b px-5 py-4">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-28" />
        </div>
        {/* Table header */}
        <div className="border-border/40 bg-muted/30 flex items-center border-b px-5 py-3.5">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="ml-6 h-2.5 w-36" />
          <Skeleton className="ml-auto h-2.5 w-16" />
          <Skeleton className="ml-6 h-2.5 w-16" />
          <Skeleton className="ml-6 h-2.5 w-16" />
          <Skeleton className="ml-6 h-2.5 w-16" />
        </div>
        {/* Table rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="border-border/30 flex items-center border-b px-5 py-3.5 last:border-0"
          >
            <Skeleton className="h-3.5 w-8" />
            <Skeleton className="ml-6 h-3.5 w-48" />
            <Skeleton className="ml-auto h-5 w-20 rounded-full" />
            <Skeleton className="ml-6 h-5 w-16 rounded-full" />
            <Skeleton className="ml-6 h-3.5 w-20" />
            <Skeleton className="ml-6 h-3.5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
