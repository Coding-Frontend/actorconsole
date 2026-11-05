import { createPageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ToolNavigation } from "@/components/intelligence/tool-navigation";
import { SeoTool } from "@/components/intelligence/research-tools";
import { PublicGridSection } from "@/components/marketing/public-grid-section";
import { ToolContentSkeleton } from "@/components/marketing/public-data-skeleton";
import Link from "next/link";
export const metadata: Metadata = createPageMetadata({
  title: "Apify Actor Listing SEO Audit",
  description:
    "Audit a public Apify Actor listing for search metadata, documentation, and clarity. Find improvements before publishing Store updates.",
  path: "/tools/seo",
  image: "seo",
});
export default function Page() {
  return (
    <main>
      <PublicGridSection>
        <ToolNavigation active="seo" />
        <h1 className="font-display-tight mt-8 text-4xl sm:text-5xl">
          Make your listing easier to find.
        </h1>
        <p className="mt-5 max-w-[65ch] text-lg leading-7 text-muted-foreground">
          Spot missing metadata and unclear documentation with a public listing audit.
        </p>
      </PublicGridSection>
      <PublicGridSection>
        <Suspense fallback={<ToolContentSkeleton kind="seo" />}>
          <SeoTool />
        </Suspense>
      </PublicGridSection>
      <PublicGridSection>
        <div className="max-w-3xl space-y-5">
          <h2 className="font-display-tight text-2xl">What does the Actor listing audit check?</h2>
          <p className="leading-7 text-muted-foreground">
            The audit reviews a public Apify Actor listing for missing search metadata,
            documentation, and clarity. Use the findings to explain what the Actor does, which
            inputs it accepts, and what users can expect in its output.
          </p>
          <h2 className="font-display-tight text-2xl">Does an audit change my live Actor?</h2>
          <p className="leading-7 text-muted-foreground">
            No. A public audit provides recommendations. Review any proposed copy before applying it
            to your listing. Search visibility also depends on the usefulness of your Actor and its
            documentation; an audit does not guarantee a ranking.
          </p>
          <Link
            href="/docs/ai-listing-studio"
            className="text-foreground underline underline-offset-4"
          >
            Read the listing improvement workflow
          </Link>
        </div>
      </PublicGridSection>
    </main>
  );
}
