import type { Metadata } from "next";
import { PublicComparisonPage } from "@/components/comparison/public-comparison-page";
import { parseComparisonWindow } from "@/lib/public-comparison";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compare Apify Actors",
  description: "Compare public Apify Store Actors side by side.",
};

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
