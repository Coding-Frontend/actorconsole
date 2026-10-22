import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5 sm:space-y-6" aria-label="Loading dashboard">
      <SkeletonPageHeader titleWidth="w-64" descriptionWidth="w-96" action />
      <div className="border-border/80 bg-card grid overflow-hidden rounded-md border sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="border-border/80 min-w-0 border-b px-5 py-4 sm:border-r lg:border-b-0 lg:last:border-r-0"
          >
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="mt-2 h-7 w-20" />
            <Skeleton className="mt-1 h-2.5 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        {[0, 1].map((panel) => (
          <section key={panel} className="border-border/80 bg-card rounded-md border p-5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-2 h-6 w-48" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 3 }).map((_, row) => (
                <div key={row} className="border-border/60 flex items-center gap-3 border-t pt-3">
                  <Skeleton className="h-4 w-4 shrink-0" />
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
