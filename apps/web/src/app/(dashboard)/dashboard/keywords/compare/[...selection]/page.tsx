import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseComparisonPath } from "@/components/comparison/comparison-paths";
import { KeywordComparisonPage } from "@/components/dashboard/keyword-comparison-page";
import type { KeywordResult } from "@/components/dashboard/keyword-research-model";
import { loadPublicComparison } from "@/lib/public-comparison";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compare Store Actors",
  description: "Compare public Store Actors side by side.",
};

function number(value: number | string | string[] | null | undefined) {
  return typeof value === "number" ? value : null;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ selection: string[] }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [route, query] = await Promise.all([params, searchParams]);
  const selection = parseComparisonPath("actor", route.selection);
  if (!selection) notFound();
  const { items } = await loadPublicComparison("actor", selection, 30);
  const initialResults: KeywordResult[] = items.map((item) => ({
    id: item.id,
    username: item.username,
    name: item.actorName ?? "",
    title: item.title,
    description: typeof item.metrics.description === "string" ? item.metrics.description : null,
    pictureUrl: item.imageUrl,
    totalRuns: number(item.metrics.totalRuns),
    usersTotal: number(item.metrics.totalUsers),
    monthlyUsers: number(item.metrics.users30Days),
    rating: number(item.metrics.rating),
    reviewCount: number(item.metrics.reviewCount),
    bookmarkCount: number(item.metrics.bookmarks),
  }));
  return (
    <KeywordComparisonPage
      key={`${selection.join("|")}:${query.q ?? ""}`}
      selection={selection}
      keyword={query.q ?? ""}
      initialResults={initialResults}
    />
  );
}
