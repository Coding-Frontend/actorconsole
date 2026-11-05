import { createPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { ToolNavigation } from "@/components/intelligence/tool-navigation";
import { PricingTool } from "@/components/intelligence/research-tools";
import { PublicGridSection } from "@/components/marketing/public-grid-section";
import Link from "next/link";
export const metadata: Metadata = createPageMetadata({
  title: "Apify Actor Pricing Calculator",
  description:
    "Model per-result prices, external service costs, break-even points, and profit margins before publishing your Apify Actor.",
  path: "/tools/pricing",
  image: "calculator",
});
export default function Page() {
  return (
    <main>
      <PublicGridSection>
        <ToolNavigation active="pricing" />
        <h1 className="font-display-tight mt-8 text-4xl sm:text-5xl">
          Price with your costs in view.
        </h1>
        <p className="mt-5 max-w-[65ch] text-lg leading-7 text-muted-foreground">
          Test a price before you publish. See how result volume and service costs affect your
          margin.
        </p>
      </PublicGridSection>
      <PublicGridSection>
        <PricingTool />
      </PublicGridSection>
      <PublicGridSection>
        <div className="max-w-3xl space-y-5">
          <h2 className="font-display-tight text-2xl">How do I estimate an Actor price?</h2>
          <p className="leading-7 text-muted-foreground">
            Enter an expected result volume, your proposed per-result price, and your estimated
            service costs. Compare revenue, costs, and margin before deciding what to publish.
            Include external services such as proxies or AI providers in your estimates when they
            apply.
          </p>
          <h2 className="font-display-tight text-2xl">
            Does the calculator publish pricing changes?
          </h2>
          <p className="leading-7 text-muted-foreground">
            No. The calculator models a scenario from your inputs. Estimates are separate from your
            actual Apify billing and revenue. Review your connected account data and the pricing
            guide before applying a price to a live Actor.
          </p>
          <Link href="/docs/pricing" className="text-foreground underline underline-offset-4">
            Read the Actor pricing guide
          </Link>
        </div>
      </PublicGridSection>
    </main>
  );
}
