import { createPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { PublicComparisonPage } from "@/components/comparison/public-comparison-page";
import { parseComparisonWindow } from "@/lib/public-comparison";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
  title: "Compare Apify Actors",
  description:
    "Compare public Apify Store Actors side by side. Review users, runs, pricing, and demand trends before choosing your next opportunity.",
  path: "/actors/compare",
  image: "compare",
});

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const query = await searchParams;
  return (
    <PublicComparisonPage kind="actor" ids={[]} window={parseComparisonWindow(query.window)} />
  );
}
