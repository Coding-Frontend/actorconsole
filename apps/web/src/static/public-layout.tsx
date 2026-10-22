import type { ReactNode } from "react";
import { MarketingHeader } from "../components/marketing/header";
import { MarketingFooter } from "../components/marketing/footer";
import { useSession } from "../lib/session-client";
import { usePathname, redirect } from "./navigation";
import { auth } from "./auth";
import { withClientData } from "./client-data";
import { safeCallbackUrl } from "../lib/safe-callback-url";
import { PublicContent } from "../components/marketing/public-content";

/** One public shell for marketing, documentation and account entry pages. */
export function PublicLayout({ children }: { children?: ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const authPage = /^\/(login|signup|forgot-password)(\/|$)/.test(pathname);
  return (
    <div className="marketing-grid-page bg-background flex min-h-screen flex-col">
      <MarketingHeader isAuthenticated={Boolean(session?.user)} />
      <PublicContent
        as={authPage ? "main" : "div"}
        className={authPage ? "flex min-h-0 flex-col" : undefined}
      >
        {children}
      </PublicContent>
      <MarketingFooter homeGrid />
    </div>
  );
}

// Keep the account-entry redirect inside the content slot, outside the shared shell.
export const AuthEntryGuard = withClientData(
  async ({
    children,
    searchParams,
  }: {
    children?: ReactNode;
    searchParams?: Promise<Record<string, string | string[]>>;
  }) => {
    const session = await auth();
    if (session?.user) {
      const query = await searchParams;
      const callback = query?.callbackUrl;
      redirect(safeCallbackUrl(typeof callback === "string" ? callback : undefined));
    }
    return children;
  },
  { layout: true },
);
