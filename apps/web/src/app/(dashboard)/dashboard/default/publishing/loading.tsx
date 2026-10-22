import { Skeleton } from "@/components/ui/skeleton";

export default function PublishingOverviewLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading publishing across all workspaces">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
