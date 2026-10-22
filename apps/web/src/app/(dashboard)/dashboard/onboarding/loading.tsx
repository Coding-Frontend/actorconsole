import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 py-2 sm:space-y-6 sm:py-4">
      <div className="border-border/80 bg-card grid gap-5 border p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="space-y-3">
          <Skeleton className="h-2.5 w-44" />
          <Skeleton className="h-10 w-full max-w-2xl" />
          <Skeleton className="h-3.5 w-full max-w-xl" />
        </div>
        <div className="border-border bg-muted/35 border px-4 py-3 lg:w-64">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="mt-2 h-5 w-20" />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="border-border/80 bg-card border p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-sm" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-2.5 w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-border/80 bg-card overflow-hidden rounded-md border">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr]">
          <div className="bg-ink border-border/40 border-b p-5 sm:p-7 lg:border-b-0 lg:border-r">
            <Skeleton className="h-3 w-28 bg-white/10" />
            <Skeleton className="mt-8 h-10 w-56 bg-white/10" />
            <Skeleton className="mt-3 h-3 w-full max-w-sm bg-white/10" />
          </div>
          <div className="space-y-5 p-5 sm:p-7">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
            <div className="border-border flex justify-end border-t pt-5">
              <Skeleton className="h-9 w-32 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      <div className="border-border/80 bg-card border p-5 sm:p-7">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-3 w-full max-w-xl" />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="border-border bg-muted/20 border p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-8 w-28" />
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-5 h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
