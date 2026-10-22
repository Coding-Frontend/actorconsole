import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Danger zone card */}
      <div className="border-destructive/40 bg-card rounded-md border p-5">
        <div className="mb-3 flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-36" />
        </div>
        <Skeleton className="mb-2 h-3 w-full" />
        <Skeleton className="mb-4 h-3 w-4/5" />
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-9 w-full" />
        </div>
        <Skeleton className="mt-3 h-9 w-32 rounded-md" />
      </div>
    </div>
  );
}
