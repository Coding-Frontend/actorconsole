import {
  createPageMetadata,
  SITE_TITLE,
  SITE_DESCRIPTION,
  siteStructuredData,
  serializeJsonLd,
} from "@/lib/seo";
import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { HomeContent } from "@/components/marketing/home-content";
import { auth } from "@/lib/auth";

export const metadata: Metadata = createPageMetadata({
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  path: "/",
  image: "home",
});

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteStructuredData) }}
      />
      <MarketingHeader isAuthenticated={Boolean(session?.user)} />
      <HomeContent isAuthenticated={Boolean(session?.user)} />
      <MarketingFooter homeGrid />
    </div>
  );
}
