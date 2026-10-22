import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { HomeContent } from "@/components/marketing/home-content";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: {
    default: "ActorConsole — DevOps Platform for Apify Actor Builders",
    template: "%s · ActorConsole",
  },
  description:
    "Organize Apify Actor workspaces, research Store demand, review listing changes, publish Actors, and see usage costs and available creator revenue.",
  openGraph: {
    title: "ActorConsole — DevOps Platform for Apify Actor Builders",
    description:
      "Organize Apify Actor workspaces, research Store demand, review listing changes, publish Actors, and see usage costs and available creator revenue.",
    type: "website",
  },
};

// Pricing copy is admin-managed. Render the landing page dynamically so an
// edit in Admin → Plan features is reflected without a new web build.
export const dynamic = "force-dynamic";

/**
 * Home page — the ActorConsole operations studio landing surface.
 */
export default async function HomePage() {
  const session = await auth();

  return (
    <div className="home-grid-page flex min-h-screen flex-col">
      <MarketingHeader isAuthenticated={Boolean(session?.user)} />
      <HomeContent isAuthenticated={Boolean(session?.user)} />
      <MarketingFooter homeGrid />
    </div>
  );
}
