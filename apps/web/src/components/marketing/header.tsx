"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container, NavLink } from "@/components/ui/layout";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ActorMark } from "@/components/brand/actor-mark";
import { NavigationDrawer } from "@/components/ui/navigation-drawer";

/**
 * ActorConsole header — a quiet instrument strip with an active rule.
 */

const navLinks = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/builders", label: "Leaderboard" },
  { href: "/research", label: "Actor research" },
  { href: "/docs", label: "Docs" },
];

function isNavLinkActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MarketingHeader({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const updateHeader = () => setIsScrolled(window.scrollY > 72);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <header
        className={cn(
          "marketing-header border-border/80 sticky top-0 z-50 w-full border-b",
          isScrolled && "marketing-header--scrolled",
        )}
      >
        <Container className="marketing-header-inner flex items-center justify-between gap-6">
          <Link
            href="/"
            aria-label="ActorConsole home"
            className="marketing-header-brand text-foreground group relative flex shrink-0 items-center"
          >
            <span className="marketing-header-lockup" aria-hidden={isScrolled}>
              <BrandLogo
                size="md"
                showDescriptor
                descriptor="Apify operations"
                markClassName="transition-transform duration-200 group-hover:rotate-3"
              />
            </span>
            <span className="marketing-header-symbol" aria-hidden="true">
              <ActorMark size={40} />
            </span>
          </Link>

          <nav
            className="marketing-header-nav hidden items-center gap-5 lg:flex"
            aria-label="Primary navigation"
            aria-hidden={isScrolled}
            inert={isScrolled}
          >
            {navLinks.map(({ href, label }) => (
              <NavLink key={href} href={href} active={isNavLinkActive(pathname, href)}>
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="marketing-header-actions hidden lg:grid">
            <div
              className="marketing-header-full-actions flex items-center gap-4"
              aria-hidden={isScrolled}
              inert={isScrolled}
            >
              {isAuthenticated ? (
                <Button size="sm" className="rounded-full" asChild>
                  <Link href="/dashboard">Go to console</Link>
                </Button>
              ) : (
                <Button size="sm" className="rounded-full" asChild>
                  <Link href="/signup">Get started</Link>
                </Button>
              )}
            </div>
            <div
              className="marketing-header-compact-actions"
              aria-hidden={!isScrolled}
              inert={!isScrolled}
            >
              <Button size="sm" className="rounded-full" asChild>
                <Link href={isAuthenticated ? "/dashboard" : "/signup"}>
                  {isAuthenticated ? "Go to console" : "Get started"}
                </Link>
              </Button>
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="workbench-control text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-10 w-10 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 lg:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-haspopup="dialog"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </Container>
        <span className="marketing-header-frame-marks" aria-hidden="true" />
      </header>

      {/* Mobile drawer lives outside the blurred header so fixed positioning uses the viewport. */}
      <NavigationDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        title="Main menu"
        overlayClassName="top-16"
        className="bg-background left-auto right-0 top-16 w-[min(88vw,22rem)] overflow-y-auto border-l border-r-0 lg:hidden"
      >
          <div className="flex min-h-full flex-col p-5">
            <div className="border-border/70 flex items-center justify-between border-b pb-4">
              <div>
                <p className="type-kicker text-signal-orange">ActorConsole</p>
                <h2
                  id="marketing-mobile-menu-title"
                  className="text-foreground mt-1 text-lg font-semibold"
                >
                  Menu
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex h-10 w-10 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="mt-5 space-y-1" aria-label="Mobile navigation">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={isNavLinkActive(pathname, href) ? "page" : undefined}
                  className={cn(
                    "focus-visible:ring-ring block rounded-sm px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2",
                    isNavLinkActive(pathname, href)
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {label}
                </Link>
              ))}
            </nav>

            <div className="border-border/70 mt-auto border-t pt-5">
              <p className="text-muted-foreground type-kicker">Account</p>
              <div className="mt-3 grid gap-4">
                {isAuthenticated ? (
                  <Button size="lg" className="w-full" asChild>
                    <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
                      Go to console
                    </Link>
                  </Button>
                ) : (
                  <Button size="lg" className="w-full" asChild>
                    <Link href="/signup" onClick={() => setMobileOpen(false)}>
                      Get started
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
      </NavigationDrawer>
    </>
  );
}
