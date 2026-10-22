import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseComparisonPath } from "@/components/comparison/comparison-paths";
import { PublicComparisonPage } from "@/components/comparison/public-comparison-page";
import { parseComparisonWindow } from "@/lib/public-comparison";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compare Apify Actors",
  description: "Compare public Apify Store Actors side by side.",
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ selection: string[] }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const [route, query] = await Promise.all([params, searchParams]);
  const ids = parseComparisonPath("actor", route.selection);
  if (!ids) notFound();
  return (
    <PublicComparisonPage kind="actor" ids={ids} window={parseComparisonWindow(query.window)} />
  );
}
