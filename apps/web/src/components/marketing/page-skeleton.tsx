import { Skeleton } from "@/components/ui/skeleton";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";

type PageHeroSkeletonProps = {
  tone?: "ink" | "paper" | "fog";
  withAside?: boolean;
};

function paletteFor(tone: PageHeroSkeletonProps["tone"]) {
  if (tone === "ink") {
    return {
      section: "semantic-accent-panel text-foreground",
      skeleton: "bg-muted",
    };
  }

  return {
    section: tone === "fog" ? "bg-fog text-foreground" : "bg-mist text-foreground",
    skeleton: "",
  };
}

export function PageHeroSkeleton({ tone = "paper", withAside = false }: PageHeroSkeletonProps) {
  const palette = paletteFor(tone);

  return (
    <HomeGridSection className={`relative overflow-hidden ${palette.section}`}>
      <HomeGridRow>
        <HomeGridCell
          className={`${withAside ? "col-span-8" : "col-span-12"} px-6 py-12 sm:px-8 sm:py-16 lg:p-12`}
        >
          <Skeleton className={`mb-8 h-3 w-40 ${palette.skeleton}`} />
          <div className="space-y-2">
            <Skeleton className={`h-14 w-full max-w-[42rem] ${palette.skeleton}`} />
            <Skeleton className={`h-14 w-[72%] max-w-[32rem] ${palette.skeleton}`} />
          </div>
          <div className="mt-6 space-y-2">
            <Skeleton className={`h-4 w-full max-w-2xl ${palette.skeleton}`} />
            <Skeleton className={`h-4 w-[90%] max-w-xl ${palette.skeleton}`} />
            <Skeleton className={`h-4 w-[58%] max-w-lg ${palette.skeleton}`} />
          </div>
        </HomeGridCell>

        {withAside ? (
          <HomeGridCell className="col-span-4 flex items-end px-6 py-14 sm:px-8 sm:py-20 lg:p-10">
            <div
              className={`w-full border p-5 sm:p-6 ${tone === "ink" ? "border-border bg-card/60" : "border-border bg-card"}`}
            >
              <Skeleton className={`h-5 w-5 rounded-full ${palette.skeleton}`} />
              <Skeleton className={`mt-5 h-8 w-56 ${palette.skeleton}`} />
              <div className="mt-3 space-y-2">
                <Skeleton className={`h-3 w-full ${palette.skeleton}`} />
                <Skeleton className={`h-3 w-[88%] ${palette.skeleton}`} />
                <Skeleton className={`h-3 w-[68%] ${palette.skeleton}`} />
              </div>
            </div>
          </HomeGridCell>
        ) : null}
      </HomeGridRow>
    </HomeGridSection>
  );
}

export function SkeletonLines({
  count = 3,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          key={index}
          className={`h-3 ${index === count - 1 ? "w-2/3" : index % 2 ? "w-[88%]" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function DarkSkeleton({ className = "" }: { className?: string }) {
  // Use the current foreground token so route-transition skeletons remain
  // visible in both themes. A fixed white wash disappears on light surfaces.
  return <Skeleton className={`bg-foreground/10 ${className}`} />;
}
