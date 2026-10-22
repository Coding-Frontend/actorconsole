import { Skeleton } from "@/components/ui/skeleton";

export default function DefaultDashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading earnings across all workspaces">
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
