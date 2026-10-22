import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" role="status" aria-label="Loading payment history">
      <Skeleton className="h-7 w-48" />
      <SkeletonCard lines={6} />
    </div>
  );
}
