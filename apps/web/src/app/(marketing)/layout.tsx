import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { PublicContent } from "@/components/marketing/public-content";
import { SessionProvider } from "@/lib/session-client";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-grid-page flex min-h-screen flex-col">
      <SessionProvider reuseAnonymousSession>
        <MarketingHeader />
      </SessionProvider>
      <PublicContent>{children}</PublicContent>
      <MarketingFooter homeGrid />
    </div>
  );
}
