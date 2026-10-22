import { Skeleton } from "@/components/ui/skeleton";
import { PublicGridSection } from "@/components/marketing/public-grid-section";
export default function ChangelogLoading() {
  return (
    <PublicGridSection frameClassName="py-16" role="status" aria-label="Loading changelog">
      <div className="mx-auto max-w-4xl space-y-8">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-10 w-full" />
        {[0, 1, 2].map((item) => (
          <div key={item} className="space-y-3 border-b pb-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        ))}
      </div>
    </PublicGridSection>
  );
}
