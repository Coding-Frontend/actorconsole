import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20">
      <div className="w-full max-w-sm space-y-4 text-center">
        <Skeleton className="mx-auto h-14 w-14 rounded-xl" />
        <Skeleton className="mx-auto h-12 w-20" />
        <Skeleton className="mx-auto h-5 w-32" />
        <Skeleton className="mx-auto h-3 w-56" />
        <Skeleton className="mx-auto h-9 w-40 rounded-md" />
      </div>
    </div>
  );
}
