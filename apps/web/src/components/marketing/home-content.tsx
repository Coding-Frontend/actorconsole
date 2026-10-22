import { Hero } from "@/components/marketing/hero";
import { ProductDemo } from "@/components/marketing/product-demo";
import { AiToolStrip } from "@/components/marketing/logo-strip";
import { Features } from "@/components/marketing/features";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { McpHighlight } from "@/components/marketing/mcp-highlight";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { CtaSection } from "@/components/marketing/cta-section";
import { NewsletterCta } from "@/components/marketing/newsletter-cta";
import { HomeGridDivider } from "@/components/marketing/home-grid";

export function HomeContent({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  return (
    <main className="flex-1">
      <Hero />
      <HomeGridDivider number="01" title="See it in action" />
      <ProductDemo />
      <HomeGridDivider number="02" title="Tools & integrations" />
      <AiToolStrip />
      <HomeGridDivider number="03" title="Core features" />
      <Features />
      <HomeGridDivider number="04" title="How it works" />
      <HowItWorks />
      <HomeGridDivider number="05" title="MCP server" />
      <McpHighlight />
      <HomeGridDivider number="06" title="Plans & pricing" />
      <PricingCards homeGrid isAuthenticated={isAuthenticated} />
      <HomeGridDivider number="07" title="Get started" />
      <CtaSection />
      <HomeGridDivider number="08" title="The builder's digest" />
      <NewsletterCta />
      <HomeGridDivider number="09" title="Explore ActorConsole" />
    </main>
  );
}
