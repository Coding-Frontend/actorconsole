import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { ChromeExtensionLink } from "@/components/chrome-extension-link";
import { FeatureRows } from "@/components/marketing/feature-rows";
import { PageHero } from "@/components/marketing/page-hero";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";

export function FeaturesPageClient() {
  return (
    <main className="marketing-page flex-1">
      <PageHero
        tone="ink"
        kicker="Platform capabilities"
        title={<>Tools for Apify Actor operations.</>}
        description="Research Store demand, review listing changes, manage publishing and status, and inspect costs and available creator revenue."
      />

      <HomeGridSection>
        <HomeGridRow className="home-grid-intro-row">
          <HomeGridCell className="col-span-5 px-6 py-14 sm:px-8 sm:py-16 lg:p-12">
            <p className="type-kicker eyebrow-line text-signal-orange">The feature register</p>
            <h2 className="font-display-tight text-foreground mt-4 text-[36px] sm:text-[48px]">
              Less tab switching. More signal.
            </h2>
          </HomeGridCell>
          <HomeGridCell className="col-span-7 flex flex-col justify-end px-6 py-14 sm:px-8 sm:py-16 lg:p-12">
            <p className="text-muted-foreground mt-5 max-w-xl text-[17px] leading-8">
              See what each feature does and which plan includes it.
            </p>
          </HomeGridCell>
        </HomeGridRow>
        <FeatureRows />
      </HomeGridSection>

      <Section variant="ink" className="relative overflow-hidden py-0">
        <div className="relative max-w-3xl py-20 sm:py-28">
          <p className="type-kicker text-signal-orange">Next move</p>
          <h2 className="font-display-tight mt-5 max-w-xl text-[40px] text-white sm:text-[56px]">
            Ready to get started?
          </h2>
          <p className="mt-5 max-w-xl text-[17px] leading-8 text-white/65">
            Start free with up to 50 actors and 500 monthly users. Upgrade as your workspace grows.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              size="lg"
              className="border-signal-orange bg-signal-orange hover:bg-signal-orange/90 text-white"
              asChild
            >
              <Link href="/signup">
                Start free <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/25 bg-transparent text-white hover:border-white/50 hover:bg-white/10 hover:text-white"
              asChild
            >
              <Link href="/pricing">View pricing</Link>
            </Button>
            <ChromeExtensionLink
              size="lg"
              className="border-white/25 bg-transparent text-white hover:border-white/50 hover:bg-white/10 hover:text-white"
            />
          </div>
        </div>
      </Section>
    </main>
  );
}
