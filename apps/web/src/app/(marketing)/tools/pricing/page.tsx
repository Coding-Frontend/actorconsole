import type { Metadata } from "next";
import { ToolNavigation } from "@/components/intelligence/tool-navigation";
import { PricingTool } from "@/components/intelligence/research-tools";
import { PublicGridSection } from "@/components/marketing/public-grid-section";
export const metadata: Metadata = {
  title: "Actor pricing calculator",
  description: "Model per-result prices, external costs, break-even, and profit margins.",
};
export default function Page() {
  return (
    <main>
      <PublicGridSection>
        <ToolNavigation active="pricing" />
        <h1 className="font-display-tight mt-8 text-4xl sm:text-5xl">
          Price with your costs in view.
        </h1>
        <p className="text-muted-foreground mt-5 max-w-[65ch] text-lg leading-7">
          Test a price before you publish. See how result volume and service costs affect your
          margin.
        </p>
      </PublicGridSection>
      <PublicGridSection>
        <PricingTool />
      </PublicGridSection>
    </main>
  );
}
