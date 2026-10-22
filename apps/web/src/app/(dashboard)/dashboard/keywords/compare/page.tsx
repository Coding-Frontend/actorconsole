import type { Metadata } from "next";
import { KeywordComparisonPage } from "@/components/dashboard/keyword-comparison-page";

export const metadata: Metadata = {
  title: "Compare Store Actors",
  description: "Compare up to five public Store Actors side by side.",
};

export default function Page() {
  return <KeywordComparisonPage />;
}
