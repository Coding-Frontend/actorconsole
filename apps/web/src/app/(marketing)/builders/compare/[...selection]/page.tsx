import { createPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { comparisonPath, parseComparisonPath } from "@/components/comparison/comparison-paths";
import { PublicComparisonPage } from "@/components/comparison/public-comparison-page";
import { parseComparisonWindow } from "@/lib/public-comparison";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ selection: string[] }>;
}): Promise<Metadata> {
  const ids = parseComparisonPath("builder", (await params).selection);
  if (!ids?.length) return { title: "Comparison not found", robots: { index: false } };
  return createPageMetadata({
    title: `Compare ${ids.join(" vs ")}`,
    description: `Compare public Apify builders ${ids.join(", ")} side by side with ActorConsole.`,
    path: comparisonPath("builder", ids),
    image: "compare",
    // Arbitrary combinations have useful previews but do not belong in search results.
    noIndex: true,
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ selection: string[] }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const [route, query] = await Promise.all([params, searchParams]);
  const ids = parseComparisonPath("builder", route.selection);
  if (!ids) notFound();
  return (
    <PublicComparisonPage kind="builder" ids={ids} window={parseComparisonWindow(query.window)} />
  );
}
