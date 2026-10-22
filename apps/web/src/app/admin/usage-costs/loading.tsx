import {
  SkeletonStatCard,
  SkeletonChart,
  SkeletonPageHeader,
  SkeletonTableSurface,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <SkeletonPageHeader titleWidth="w-40" descriptionWidth="w-72" action />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Chart */}
      <SkeletonChart />

      <SkeletonTableSurface columns={5} rows={8} />
    </div>
  );
}
