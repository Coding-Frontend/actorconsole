import { redirect } from "next/navigation";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { auth } from "@/lib/auth";
import { PublicContent } from "@/components/marketing/public-content";

export const metadata = {
  title: { default: "ActorConsole", template: "%s · ActorConsole" },
  description: "Sign in or create your ActorConsole account.",
  robots: { index: false, follow: false },
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="marketing-grid-page bg-background flex min-h-screen flex-col">
      <MarketingHeader isAuthenticated={false} />
      <PublicContent as="main" className="flex min-h-0 flex-col">
        {children}
      </PublicContent>
      <MarketingFooter homeGrid />
    </div>
  );
}
