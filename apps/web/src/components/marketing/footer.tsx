import Link from "next/link";
import { Container } from "@/components/ui/layout";
import { Separator } from "@/components/ui/separator";
import { POLICY_META } from "@actorconsole/shared";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { HomeGridCell, HomeGridRow } from "@/components/marketing/home-grid";
import { CHROME_EXTENSION_STORE_URL } from "@/lib/chrome-extension";

const groups: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/builders", label: "Leaderboard" },
      { href: "/research", label: "Actor research" },
      { href: "/docs", label: "Docs" },
      { href: CHROME_EXTENSION_STORE_URL, label: "Chrome extension" },
      { href: "/changelog", label: "Changelog" },
      { href: "/faq", label: "FAQ" },
      { href: "/status", label: "Status" },
    ],
  },
  {
    title: "Tools",
    links: [
      { href: "/tools/pricing", label: "Pricing calculator" },
      { href: "/tools/seo", label: "SEO audit" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/customers", label: "Customers" },
      { href: "/blog", label: "Blog" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      ...POLICY_META.map((policy) => ({ href: policy.path, label: policy.shortLabel })),
      { href: "/chrome-extension/privacy", label: "Extension privacy" },
    ],
  },
];

export function MarketingFooter({ homeGrid = false }: { homeGrid?: boolean }) {
  if (homeGrid) {
    return (
      <footer className="border-border/60 bg-background border-b border-dashed">
        <div className="home-grid-frame home-grid-footer">
          <HomeGridRow>
            <HomeGridCell className="col-span-12 px-4 py-8 sm:px-8 sm:py-14 lg:p-12">
              <Link href="/" aria-label="ActorConsole home" className="text-foreground inline-flex">
                <BrandLogo size="lg" />
              </Link>
              <p className="text-muted-foreground mt-4 max-w-sm text-base leading-7 sm:mt-6">
                The clearest way to operate Apify actors from first signal to shipped release.
              </p>
            </HomeGridCell>
          </HomeGridRow>

          <HomeGridRow>
            {groups.map((group) => (
              <HomeGridCell
                key={group.title}
                className="col-span-3 px-4 py-6 sm:px-8 sm:py-9 lg:p-10"
              >
                <nav aria-labelledby={`home-footer-${group.title.toLowerCase()}`}>
                  <h2
                    id={`home-footer-${group.title.toLowerCase()}`}
                    className="home-grid-index text-foreground/70"
                  >
                    {group.title}
                  </h2>
                  <ul className="mt-4 space-y-0.5 sm:mt-5 sm:space-y-1">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          target={link.href.startsWith("https://") ? "_blank" : undefined}
                          rel={link.href.startsWith("https://") ? "noopener noreferrer" : undefined}
                          className="text-muted-foreground hover:text-foreground group inline-flex items-center gap-2 py-1 text-sm transition-colors sm:py-1.5"
                        >
                          {link.label}
                          <span
                            aria-hidden="true"
                            className="text-signal-orange opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            ↗
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              </HomeGridCell>
            ))}
          </HomeGridRow>

          <HomeGridRow>
            <HomeGridCell className="text-muted-foreground col-span-9 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 text-xs sm:px-8 sm:py-6">
              <span>© {new Date().getFullYear()} ActorConsole</span>
              <span>Not affiliated with Apify Technologies</span>
              <Link href="/legal/privacy" className="hover:text-foreground">
                Privacy
              </Link>
              <Link href="/legal/terms" className="hover:text-foreground">
                Terms
              </Link>
            </HomeGridCell>
            <HomeGridCell className="col-span-3 flex items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-4">
              <span className="home-grid-index">Appearance</span>
              <ThemeToggle className="rounded-sm" />
            </HomeGridCell>
          </HomeGridRow>
        </div>
      </footer>
    );
  }

  return (
    <footer className="blueprint-chrome blueprint-chrome-dark border-border/80 bg-ink border-t text-white">
      <Container className="py-16 sm:py-20 lg:py-24">
        <div className="grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.25fr)_repeat(4,minmax(0,1fr))] lg:gap-x-8">
          <div className="max-w-sm sm:col-span-2 lg:col-span-1">
            <Link href="/" aria-label="ActorConsole home" className="inline-flex text-white">
              <BrandLogo size="lg" className="text-white" />
            </Link>
            <p className="mt-6 max-w-xs text-base leading-7 text-white/55">
              Operations tooling for Apify Actor builders. Improve listings, manage publishing, and
              understand platform usage costs.
            </p>
            <p className="type-kicker mt-8 text-white/35">AC-001 / APIFY BUILDER TOOLING</p>
          </div>

          {groups.map((group) => (
            <nav key={group.title} aria-labelledby={`footer-${group.title.toLowerCase()}`}>
              <h2 id={`footer-${group.title.toLowerCase()}`} className="type-kicker text-white/55">
                {group.title}
              </h2>
              <ul className="mt-5 space-y-1">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      target={link.href.startsWith("https://") ? "_blank" : undefined}
                      rel={link.href.startsWith("https://") ? "noopener noreferrer" : undefined}
                      className="group inline-flex max-w-full items-center gap-2 rounded-sm py-1.5 text-base leading-7 text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:text-lg lg:text-base"
                    >
                      <span className="truncate">{link.label}</span>
                      <span
                        aria-hidden="true"
                        className="text-signal-orange -translate-x-1 text-sm opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                      >
                        ↗
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <Separator className="my-14 bg-white/15 sm:my-16" />

        <div
          aria-label="Footer utilities"
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 text-left sm:flex sm:justify-between sm:gap-6"
        >
          <div className="min-w-0 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
            <p className="text-xs leading-5 text-white/60 sm:text-sm lg:text-base">
              © {new Date().getFullYear()} ActorConsole. Not affiliated with Apify Technologies.
            </p>
            <span
              className="bg-signal-orange hidden h-1 w-1 rounded-full sm:block"
              aria-hidden="true"
            />
            <p className="mt-1 text-xs leading-5 text-white/40 sm:mt-0 sm:text-sm lg:text-base">
              Built for Apify Actor developers.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 rounded-sm border border-white/15 bg-white/[0.03] px-2.5 py-1.5 sm:gap-3 sm:px-3 sm:py-2">
            <span className="text-xs font-medium text-white/50 sm:text-sm">Appearance</span>
            <ThemeToggle className="h-9 w-9 rounded-sm border-white/15 bg-white/[0.06] text-white/75 hover:border-white/35 hover:bg-white/10 hover:text-white" />
          </div>
        </div>
      </Container>
    </footer>
  );
}
