import { cn } from "@/lib/utils";

/**
 * A tiny shimmer placeholder — works without any CSS framework beyond
 * a `<style>` block at the app root (Tailwind's `animate-pulse` is used
 * for accessibility if available, but the inline gradient works too).
 */
export function Skeleton({
  className,
  shimmer = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { shimmer?: boolean }) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        // A muted wash nearly disappears on the light canvas. Use the
        // semantic foreground token so loading geometry remains visible in
        // both light and dark themes.
        "bg-foreground/10 relative max-w-full overflow-hidden rounded-sm",
        "before:absolute before:inset-0 before:-translate-x-full",
        shimmer && "before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r",
        "before:from-transparent before:via-white/40 before:to-transparent",
        "motion-reduce:before:animate-none dark:before:via-white/10",
        className,
      )}
      {...props}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${Math.max(40, 100 - i * 12)}%` }} />
      ))}
    </div>
  );
}

export function SkeletonCard({
  className,
  lines = 3,
  children,
}: {
  className?: string;
  lines?: number;
  children?: React.ReactNode;
}) {
  if (children) {
    return (
      <div className={cn("border-border/75 bg-card rounded-sm border p-5 sm:p-6", className)}>
        {children}
      </div>
    );
  }
  return (
    <div className={cn("border-border/75 bg-card rounded-sm border p-5 sm:p-6", className)}>
      <Skeleton className="mb-3 h-4 w-1/3" />
      <SkeletonText lines={lines} />
    </div>
  );
}

export function SkeletonStatCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border-border/80 bg-card relative overflow-hidden rounded-md border",
        className,
      )}
    >
      <span className="bg-signal-blue absolute inset-x-0 top-0 h-0.5" aria-hidden="true" />
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-4 rounded-sm" />
        </div>
        <Skeleton className="h-7 w-24" />
        <Skeleton className="mt-2 h-3 w-28" />
      </div>
    </div>
  );
}

export function SkeletonRow({ columns = 4 }: { columns?: number }) {
  return (
    <div className="border-border/40 flex items-center gap-4 border-b py-3">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: `${100 - i * 15}%`, maxWidth: "200px" }}
        />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div>
      <div className="border-border/40 flex items-center gap-4 border-b py-2">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 w-16" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} columns={columns} />
      ))}
    </div>
  );
}

export function SkeletonList({ items = 4 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <SkeletonCard key={i} lines={2} />
      ))}
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn("border-border/80 bg-card overflow-hidden rounded-md border", className)}>
      <div className="border-border/80 border-b p-4 sm:p-6">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-2 h-7 w-56" />
      </div>
      <div className="p-4 sm:p-6">
        <div className="border-border/70 relative h-40 border-b border-l">
          <div className="border-border/40 pointer-events-none absolute inset-x-0 top-1/4 border-t" />
          <div className="border-border/40 pointer-events-none absolute inset-x-0 top-1/2 border-t" />
          <div className="border-border/40 pointer-events-none absolute inset-x-0 top-3/4 border-t" />
          <div className="relative flex h-full items-end gap-1 px-2">
            {Array.from({ length: 24 }).map((_, i) => (
              <Skeleton
                key={i}
                className="min-w-0 flex-1 rounded-b-none rounded-t-sm"
                style={{
                  height: `${38 + Math.round((Math.sin(i * 0.5) + 1) * 18) + (i % 3) * 4}%`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="mt-3 flex justify-between gap-4">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonAvatar({ size = 32 }: { size?: number }) {
  return <Skeleton className="rounded-full" style={{ width: size, height: size }} />;
}

/** Header skeleton shared by the ruled dashboard and admin workspaces. */
export function SkeletonPageHeader({
  titleWidth = "w-40",
  descriptionWidth = "w-64",
  action = false,
}: {
  titleWidth?: string;
  descriptionWidth?: string;
  action?: boolean;
}) {
  return (
    <div className="border-border/80 flex flex-col items-start justify-between gap-5 border-b pb-6 sm:flex-row sm:items-end">
      <div className="min-w-0 max-w-3xl space-y-2">
        <Skeleton shimmer={false} className="h-2.5 w-44" />
        <Skeleton shimmer={false} className={`h-8 max-w-full ${titleWidth}`} />
        <Skeleton shimmer={false} className={`h-3.5 max-w-full ${descriptionWidth}`} />
      </div>
      {action ? <Skeleton shimmer={false} className="h-9 w-32 rounded-md" /> : null}
    </div>
  );
}

/** Table surface with authored header/row rules instead of floating rectangles. */
export function SkeletonTableSurface({
  columns = 5,
  rows = 6,
  className,
}: {
  columns?: number;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("border-border/80 bg-card overflow-hidden rounded-md border", className)}>
      <div className="border-border/80 bg-muted/30 grid grid-cols-[minmax(9rem,1.4fr)_repeat(4,minmax(5rem,1fr))] border-b px-5 py-3.5">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton
            key={index}
            className={`h-2.5 ${index === 0 ? "w-24" : index % 2 ? "w-16" : "w-20"}`}
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="border-border/50 grid grid-cols-[minmax(9rem,1.4fr)_repeat(4,minmax(5rem,1fr))] items-center border-b px-5 py-3.5 last:border-b-0"
        >
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={`${columnIndex === 0 ? "h-3.5" : "h-3"} ${
                columnIndex === 0 ? "w-36" : columnIndex % 2 ? "w-16" : "w-24"
              } ${columnIndex > 0 ? "ml-6" : ""}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Full dashboard page skeleton — matches the actual layout */
export function SkeletonDashboardPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="border-border/80 bg-card relative overflow-hidden rounded-md border">
        <span className="bg-signal-orange absolute inset-y-0 left-0 w-1" aria-hidden="true" />
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 lg:px-7">
          <div className="w-full max-w-2xl space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-2.5 w-20" />
            </div>
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-3.5 w-full max-w-xl" />
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Skeleton className="h-9 flex-1 rounded-md sm:w-32 sm:flex-none" />
            <Skeleton className="h-9 flex-1 rounded-md sm:w-32 sm:flex-none" />
          </div>
        </div>
        <div className="border-border/80 grid border-t sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="border-border/80 min-w-0 border-b px-5 py-4 last:border-b-0 sm:border-r sm:px-6 lg:border-b-0 lg:last:border-r-0"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Skeleton className="h-2.5 w-24" />
                  <Skeleton className="mt-2 h-7 w-20" />
                  <Skeleton className="mt-1 h-2.5 w-28" />
                </div>
                <Skeleton className="h-4 w-4 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border/60 bg-destructive/[0.045] flex items-center gap-3 rounded-md border p-5">
        <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3.5 w-full max-w-2xl" />
        </div>
        <Skeleton className="hidden h-9 w-32 rounded-md sm:block" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <SkeletonCard className="overflow-hidden p-0" lines={5}>
          <div className="border-border/80 border-b px-5 py-4 sm:px-6">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-2 h-6 w-56" />
          </div>
          <div className="divide-border/70 divide-y px-5 sm:px-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-3.5"
              >
                <Skeleton className="h-2.5 w-5" />
                <div className="min-w-0 space-y-1.5">
                  <Skeleton className="h-3.5 w-40 max-w-full" />
                  <Skeleton className="h-2.5 w-28" />
                </div>
                <Skeleton className="hidden h-2.5 w-20 sm:block" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard className="overflow-hidden p-0" lines={5}>
          <div className="border-border/80 border-b px-5 py-4">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-2 h-6 w-40" />
          </div>
          <div className="divide-border/70 divide-y px-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 py-4">
                <Skeleton className="h-4 w-4 rounded-sm" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-40 max-w-full" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <SkeletonChart />
        <SkeletonCard lines={6} />
      </div>
    </div>
  );
}

/** Actors page skeleton — card grid with header */
export function SkeletonActorsPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-border/40 bg-card rounded-md border p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <Skeleton className="mb-2 h-5 w-40" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <div className="mt-4 flex gap-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="mt-3 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
