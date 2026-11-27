"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container, NavLink } from "@/components/ui/layout";
import { cn } from "@/lib/utils";
import { ActorMark } from "@/components/brand/actor-mark";
import { BrandLogo } from "@/components/brand/brand-logo";
import { NavigationDrawer } from "@/components/ui/navigation-drawer";
import { useSession } from "@/lib/session-client";

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

export function MarketingHeader({ isAuthenticated }: { isAuthenticated?: boolean }) {
  const pathname = usePathname();
  const { status } = useSession();
  const authenticated = isAuthenticated ?? status === "authenticated";
  const actionHref = authenticated ? "/dashboard" : "/signup";
  const actionLabel = authenticated ? "Go to console" : "Get started";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const homeLinkRef = useRef<HTMLAnchorElement>(null);
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const updateHeader = () => {
      const scrolled = window.scrollY > 72;
      if (scrolled && navigationRef.current?.contains(document.activeElement)) {
        homeLinkRef.current?.focus({ preventScroll: true });
      }
      setIsScrolled(scrolled);
    };

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
        <Container className="marketing-header-inner flex items-center justify-between gap-6 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)_auto]">
          <Link
            ref={homeLinkRef}
            prefetch={false}
            href="/"
            aria-label="ActorConsole home"
            className="marketing-header-brand text-foreground group h-12 min-w-0"
          >
            <span className="marketing-header-lockup" aria-hidden="true">
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

          <div className="hidden self-start lg:block">
            <nav
              ref={navigationRef}
              className="marketing-header-nav absolute inset-x-0 top-0 flex items-center justify-center gap-5"
              aria-label="Primary navigation"
              inert={isScrolled}
              aria-hidden={isScrolled}
            >
              {navLinks.map(({ href, label }) => (
                <NavLink key={href} href={href} active={isNavLinkActive(pathname, href)}>
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>

          <Button size="sm" className="hidden rounded-full lg:inline-flex" asChild>
            <Link prefetch={false} href={actionHref}>
              {actionLabel}
            </Link>
          </Button>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="workbench-control text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 lg:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-haspopup="dialog"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </Container>
        <span className="marketing-header-frame-marks" aria-hidden="true" />
      </header>

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
                  prefetch={false}
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
                <Button size="lg" className="w-full" asChild>
                  <Link prefetch={false} href={actionHref} onClick={() => setMobileOpen(false)}>
                    {actionLabel}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
      </NavigationDrawer>
    </>
  );
}
