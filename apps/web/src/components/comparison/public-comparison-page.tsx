import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PublicComparisonPageSelection } from "./public-comparison-provider";
import { PublicComparisonExplorer } from "./public-comparison-explorer";
import type { PublicCompareKind } from "./public-comparison-items";
import { loadPublicComparison } from "@/lib/public-comparison";
import type { BuilderWindow } from "@/lib/builders";
import { HomeGridSection } from "@/components/marketing/home-grid";

export async function PublicComparisonPage({
  kind,
  ids,
  window,
}: {
  kind: PublicCompareKind;
  ids: string[];
  window: BuilderWindow;
}) {
  const { items, missing } = await loadPublicComparison(kind, ids, window);
  const noun = kind === "actor" ? "Actors" : "builders";
  const title =
    items.length === 2
      ? `${items[0].title} vs ${items[1].title}`
      : items.length === 1
        ? `${items[0].title} compared to other ${noun}`
        : `Compare ${noun}`;
  const exploreHref =
    kind === "actor" && items[0]
      ? `/builders/${encodeURIComponent(items[0].username)}?window=${window}`
      : "/builders";

  return (
    <main className="bg-background">
      <PublicComparisonPageSelection kind={kind} items={items} />
      <HomeGridSection frameClassName="min-w-0 px-5 pb-16 pt-6 sm:px-8 sm:pt-8 lg:px-12 lg:pt-10">
        <nav
          aria-label="Breadcrumb"
          className="text-muted-foreground flex items-center gap-1.5 text-xs"
        >
          <Link href={exploreHref} className="hover:text-foreground hover:underline">
            {kind === "actor" ? "Builder Actors" : "Leaderboard"}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-foreground">Compare</span>
        </nav>
        <header className="mb-6 mt-5 max-w-4xl sm:mb-8 sm:mt-6">
          <h1 className="font-display-tight text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
            {title}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6 sm:mt-3 sm:text-base">
            {kind === "actor"
              ? "Compare public Actor listings, pricing, usage, and trust signals from the latest available Store data."
              : "Compare public builder portfolios, audience, activity, and standing from the latest available Store data."}
          </p>
        </header>
        {missing > 0 ? (
          <p className="border-border bg-card mb-6 border px-4 py-3 text-sm" role="status">
            {missing} selected {kind === "actor" ? "Actor" : "builder"}
            {missing === 1 ? "" : "s"} could not be found in the public catalog.
          </p>
        ) : null}
        <div>
          <PublicComparisonExplorer
            key={kind}
            items={items}
            kind={kind}
            window={window}
            mode="page"
          />
        </div>
      </HomeGridSection>
    </main>
  );
}
