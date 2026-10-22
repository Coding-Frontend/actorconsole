import {
  SkeletonCard,
  SkeletonStatCard,
  SkeletonChart,
  SkeletonPageHeader,
  SkeletonTableSurface,
} from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <SkeletonPageHeader titleWidth="w-48" descriptionWidth="w-96" action />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.7fr)]">
        <SkeletonChart />
        <SkeletonCard lines={5} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <SkeletonChart />
        <SkeletonCard lines={4} />
      </div>

      <SkeletonTableSurface columns={5} rows={5} />
    </div>
  );
}
