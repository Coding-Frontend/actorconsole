import { FeatureRows } from "@/components/marketing/feature-rows";
import { featureMeta } from "@/components/marketing/features/features-meta";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";

export function Features() {
  return (
    <HomeGridSection>
      <HomeGridRow className="home-grid-intro-row">
        <HomeGridCell className="col-span-5 px-6 py-14 sm:px-8 sm:py-16 lg:p-12">
          <p className="home-grid-kicker">The operating surface</p>
          <h2 className="font-display-tight text-foreground mt-5 max-w-sm text-[42px] sm:text-[54px]">
            Less tab switching. More signal.
          </h2>
        </HomeGridCell>
        <HomeGridCell className="col-span-7 flex items-end justify-between gap-5 px-6 py-14 sm:px-8 sm:py-16 lg:p-12">
          <p className="text-muted-foreground text-[17px] leading-8">
            Research Store keywords, review listings, publish Actors, and inspect costs
            and available revenue from your workspace.
          </p>
          <span className="data-stamp text-muted-foreground hidden shrink-0 sm:block">
            {String(featureMeta.length).padStart(2, "0")} surfaces
          </span>
        </HomeGridCell>
      </HomeGridRow>

      <FeatureRows />
    </HomeGridSection>
  );
}
