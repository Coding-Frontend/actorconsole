import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { PublicContent } from "@/components/marketing/public-content";
import { SessionProvider } from "@/lib/session-client";
import { CatalogDocumentNavigation } from "@/components/marketing/catalog-document-navigation";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-grid-page flex min-h-screen flex-col">
      {process.env.NEXT_PUBLIC_CATALOG_ASSET_ORIGIN ? <CatalogDocumentNavigation /> : null}
      <SessionProvider reuseAnonymousSession>
        <MarketingHeader />
      </SessionProvider>
      <PublicContent>{children}</PublicContent>
      <MarketingFooter homeGrid />
    </div>
  );
}
