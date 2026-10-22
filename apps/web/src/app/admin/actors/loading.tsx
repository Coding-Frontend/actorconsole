import { PageHeader } from "@/components/admin/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeader title="Actors" description="Tracked actors across all users" />

      <div className="border-border/80 bg-card rounded-md border">
        <div className="border-border/40 bg-muted/30 flex items-center border-b px-5 py-3.5">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="ml-auto h-2.5 w-20" />
          <Skeleton className="ml-8 h-2.5 w-28" />
          <Skeleton className="ml-8 h-2.5 w-20" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="border-border/30 flex items-center border-b px-5 py-3.5 last:border-0"
          >
            <div className="space-y-1">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-2.5 w-20" />
            </div>
            <Skeleton className="ml-auto h-3.5 w-28" />
            <Skeleton className="ml-8 h-3.5 w-36" />
            <Skeleton className="ml-8 h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
