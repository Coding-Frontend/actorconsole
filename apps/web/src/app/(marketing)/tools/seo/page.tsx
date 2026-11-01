import { createPageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ToolNavigation } from "@/components/intelligence/tool-navigation";
import { SeoTool } from "@/components/intelligence/research-tools";
import { PublicGridSection } from "@/components/marketing/public-grid-section";
import { ToolContentSkeleton } from "@/components/marketing/public-data-skeleton";
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
        <p className="text-muted-foreground mt-5 max-w-[65ch] text-lg leading-7">
          Spot missing metadata and unclear documentation with a public listing audit.
        </p>
      </PublicGridSection>
      <PublicGridSection>
        <Suspense fallback={<ToolContentSkeleton kind="seo" />}>
          <SeoTool />
        </Suspense>
      </PublicGridSection>
    </main>
  );
}
