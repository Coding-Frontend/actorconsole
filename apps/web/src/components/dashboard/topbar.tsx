"use client";

import { usePathname } from "next/navigation";
import { Menu, Search, Command } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { BusinessProfileSwitcher } from "@/components/dashboard/business-profile-switcher";
import { NotificationCenter } from "@/components/dashboard/notification-center";
import {
  DEFAULT_DASHBOARD_PATH,
  ALL_WORKSPACES_PUBLISHING_PATH,
  isAllWorkspacesPath,
} from "@actorconsole/shared/default-dashboard";

const pageTitles: Array<[string, string]> = [
  [ALL_WORKSPACES_PUBLISHING_PATH, "Publishing overview"],
  [DEFAULT_DASHBOARD_PATH, "All Workspaces"],
  ["/dashboard/actors/optimization", "Optimization review"],
  ["/dashboard/actors", "Actors"],
  ["/dashboard/publishing/schedules/new", "New publishing schedule"],
  ["/dashboard/publishing/schedules", "Publishing schedules"],
  ["/dashboard/publishing", "Publishing inventory"],
  ["/dashboard/usage", "Usage"],
  ["/dashboard/costs", "Costs"],
  ["/dashboard/revenue", "Revenue"],
  ["/dashboard/apify", "Apify connection"],
  ["/dashboard/mcp", "MCP access"],
  ["/dashboard/keywords", "Keyword research"],
  ["/dashboard/tools/pricing", "Pricing calculator"],
  ["/dashboard/tools/seo", "SEO audit"],
  ["/dashboard/onboarding", "Onboarding"],
  ["/dashboard/notifications", "Notifications"],
  ["/dashboard/support", "Support"],
  ["/dashboard/profile", "Profile"],
  ["/dashboard/notification-preferences", "Notification preferences"],
  ["/dashboard/billing", "Billing"],
  ["/dashboard/data-export", "Data export"],
  ["/dashboard/account", "Account"],
];

interface DashboardTopbarProps {
  onMenuToggle?: () => void;
  onCmdK?: () => void;
  unreadNotifications?: number;
}

export function DashboardTopbar({
  onMenuToggle,
  onCmdK,
  unreadNotifications = 0,
}: DashboardTopbarProps) {
  const pathname = usePathname();

  const pageTitle =
    pageTitles.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ??
    (pathname === "/dashboard"
      ? "Overview"
      : (pathname
          .split("/")
          .filter(Boolean)
          .at(-1)
          ?.replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()) ?? "Overview"));

  return (
    <header className="dashboard-topbar app-shell-header-row border-border/80 bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 flex min-w-0 items-center border-b backdrop-blur-xl">
      <div className="flex w-full min-w-0 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {onMenuToggle && (
            <button
              type="button"
              onClick={onMenuToggle}
              className="workbench-control border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 md:hidden"
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0">
            <p className="data-stamp text-muted-foreground hidden uppercase tracking-[0.1em] sm:block">
              {isAllWorkspacesPath(pathname)
                ? `All Workspaces / ${pathname === ALL_WORKSPACES_PUBLISHING_PATH ? "Publishing" : "Earnings"}`
                : "Workspace / Live"}
            </p>
            <h1 className="font-display-tight truncate text-[20px] leading-tight">{pageTitle}</h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <BusinessProfileSwitcher />
          {!isAllWorkspacesPath(pathname) && (
            <button
              type="button"
              onClick={onCmdK}
              aria-label="Search workspace (Command K)"
              className={cn(
                "dashboard-workspace-search workbench-control border-border bg-card hidden h-9 shrink-0 items-center justify-center gap-2 rounded-sm border px-2 shadow-sm sm:inline-flex",
                "text-muted-foreground hover:border-signal-blue/50 hover:text-foreground focus-visible:ring-ring text-xs transition-[border-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2",
              )}
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="dashboard-workspace-search-label flex-1 text-left">
                Search workspace
              </span>
              <kbd className="dashboard-workspace-search-shortcut border-border bg-muted/70 items-center gap-0.5 rounded-[3px] border px-1.5 py-0.5 font-mono text-[9px] font-medium">
                <Command className="h-2.5 w-2.5" />K
              </kbd>
            </button>
          )}
          <NotificationCenter unreadNotifications={unreadNotifications} />
          <ThemeToggle className="shrink-0" />
        </div>
      </div>
    </header>
  );
}
