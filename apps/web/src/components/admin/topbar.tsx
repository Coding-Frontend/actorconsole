"use client";

import { ShieldCheck, ExternalLink, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminSidebar } from "./sidebar-provider";
import { ThemeToggle } from "@/components/theme-toggle";

export function AdminTopbar() {
  const { toggleMobile } = useAdminSidebar();
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const sectionLabels: Record<string, string> = {
    "ai-providers": "AI Providers",
    "audit-log": "Audit Log",
    "email-log": "Email Log",
    "faq-admin": "FAQ",
    "feature-flags": "Feature Flags",
    "payment-gateways": "Payment Gateways",
    "plan-features": "Plan Marketing Copy",
    "usage-costs": "Usage Costs",
  };
  const pageTitle =
    segments.length < 2
      ? "Overview"
      : (sectionLabels[segments[1]] ??
        segments[1].replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()));

  return (
    <header className="app-shell-header-row border-border/80 bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 flex min-w-0 items-center border-b backdrop-blur-xl">
      <div className="app-shell-content-container flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={toggleMobile}
            className="workbench-control border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 lg:hidden"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-signal-orange inline-flex items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em]">
                <ShieldCheck className="h-3 w-3" /> Admin
              </span>
              <span className="text-muted-foreground hidden font-mono text-[9px] uppercase tracking-[0.08em] sm:inline">
                / Audited session
              </span>
            </div>
            <p className="font-display-tight truncate text-[20px] leading-tight">{pageTitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle className="shrink-0" />
          <Link
            href="/"
            target="_blank"
            rel="noreferrer"
            className="workbench-control border-border bg-card text-muted-foreground hover:border-signal-blue/50 hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex h-9 w-9 items-center justify-center rounded-sm border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
            aria-label="Open public site"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
