import { Section, Container } from "@/components/ui/layout";
import { getPublicProOffers } from "@/lib/public-pro-offers";
import { getPlanMarketingFeatures } from "@/lib/plan-marketing-features";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "./home-grid";
import { PricingPlanPicker } from "./pricing-plan-picker";

type PricingCardsProps = {
  sectionVariant?: "default" | "muted";
  homeGrid?: boolean;
  isAuthenticated?: boolean;
  showIntro?: boolean;
};

export async function PricingCards({
  sectionVariant = "default",
  homeGrid = false,
  isAuthenticated = false,
  showIntro = true,
}: PricingCardsProps) {
  const [features, offers] = await Promise.all([getPlanMarketingFeatures(), getPublicProOffers()]);
  const content = (
    <>
      {showIntro ? (
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="font-display-tight text-foreground text-4xl sm:text-5xl">
            Start free. Grow with Pro.
          </h2>
          <p className="text-muted-foreground mt-4 text-base leading-7">
            One workspace for your Apify portfolio. Every workflow on Free; unlimited actors and
            monthly users on Pro.
          </p>
        </div>
      ) : null}
      <PricingPlanPicker features={features} offers={offers} isAuthenticated={isAuthenticated} />
    </>
  );
  return homeGrid ? (
    <HomeGridSection className="bg-fog/35">
      <HomeGridRow>
        <HomeGridCell className="col-span-12 px-5 py-10 sm:px-8 sm:py-12 lg:px-12">
          {content}
        </HomeGridCell>
      </HomeGridRow>
    </HomeGridSection>
  ) : (
    <Section variant={sectionVariant} className="section-rule">
      <Container>{content}</Container>
    </Section>
  );
}
