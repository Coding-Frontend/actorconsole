import { createPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { FeaturesPageClient } from "./features-page-client";

export const metadata: Metadata = createPageMetadata({
  title: "Features for Apify Actor Builders",
  description:
    "Research Store demand, review AI-assisted listing changes, schedule Actor publishing, and track usage costs and available revenue.",
  path: "/features",
  image: "features",
});

export default function FeaturesPage() {
  return <FeaturesPageClient />;
}
