import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />

      {/* Log entries */}
      <div className="border-border/80 bg-card rounded-md border">
        <div className="border-border/40 bg-muted/30 flex items-center border-b px-5 py-3.5">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="ml-auto h-2.5 w-16" />
          <Skeleton className="ml-6 h-2.5 w-32" />
          <Skeleton className="ml-6 h-2.5 w-20" />
          <Skeleton className="ml-6 h-2.5 w-24" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="border-border/30 flex items-center border-b px-5 py-3.5 last:border-0"
          >
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="ml-auto h-3.5 w-16" />
            <Skeleton className="ml-6 h-3.5 w-40" />
            <Skeleton className="ml-6 h-5 w-20 rounded-full" />
            <Skeleton className="ml-6 h-3.5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
