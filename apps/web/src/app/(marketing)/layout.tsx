import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { auth } from "@/lib/auth";
import { PublicContent } from "@/components/marketing/public-content";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="marketing-grid-page flex min-h-screen flex-col">
      <MarketingHeader isAuthenticated={Boolean(session?.user)} />
      <PublicContent>{children}</PublicContent>
      <MarketingFooter homeGrid />
    </div>
  );
}
