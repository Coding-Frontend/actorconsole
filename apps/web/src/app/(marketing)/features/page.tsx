import type { Metadata } from "next";
import { FeaturesPageClient } from "./features-page-client";

export const metadata: Metadata = {
  title: "Features — ActorConsole",
  description:
    "Apify Actor tools for Store research, AI listing review, publishing schedules, usage costs, and available creator revenue.",
  openGraph: {
    title: "ActorConsole Features",
    description:
      "Keyword watchlists, AI listing review, pricing, Actor publishing and status management, usage costs, and available revenue and profit reporting.",
  },
};

export default function FeaturesPage() {
  return <FeaturesPageClient />;
}
