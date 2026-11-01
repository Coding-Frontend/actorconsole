import { createPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicComparisonPage } from "@/components/comparison/public-comparison-page";
import { publicComparisonHref } from "@/components/comparison/comparison-paths";
import { parseComparisonIds, parseComparisonWindow } from "@/lib/public-comparison";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
  title: "Compare Apify Builders",
  description:
    "Compare public Apify builders side by side by Actor portfolios, users, runs, and estimated earnings.",
  path: "/builders/compare",
  image: "compare",
});

export default async function BuilderComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; item?: string | string[]; window?: string }>;
}) {
  const query = await searchParams;
  const kind = query.kind === "actor" ? "actor" : "builder";
  const window = parseComparisonWindow(query.window);
  const ids = parseComparisonIds(query.item);
  if (ids.length || kind === "actor") redirect(publicComparisonHref(kind, ids, window));
  return <PublicComparisonPage kind="builder" ids={[]} window={window} />;
}
