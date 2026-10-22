"use client";

import { notifySessionChanged } from "@/lib/session-events";
import { navigateInApp } from "@/lib/client-navigation";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/lib/session-client";
import {
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  UploadCloud,
  X,
} from "lucide-react";
import {
  DEFAULT_DASHBOARD_PATH,
  ALL_WORKSPACES_PUBLISHING_PATH,
  isAllWorkspacesPath,
} from "@actorconsole/shared/default-dashboard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { signOutFirebase } from "@/lib/firebase";
import { BrandLogo } from "@/components/brand/brand-logo";
import { BusinessProfileSwitcher } from "@/components/dashboard/business-profile-switcher";
import { WorkspacePlanBanner } from "@/components/dashboard/workspace-plan-banner";
import type { WorkspaceAccess } from "@actorconsole/shared/workspace-access";
import {
  accountNavigation,
  activeNavigationGroup,
  visibleDashboardNavigation,
  dashboardNavigation,
  navigationItemActive,
  type NavigationStatusKey,
} from "@/components/dashboard/dashboard-navigation";

const SIDEBAR_STORAGE_KEY = "actorconsole:dashboard-navigation-groups";

export type DashboardNavigationStatus = Record<NavigationStatusKey, number | boolean>;

export const DEFAULT_DASHBOARD_NAVIGATION_STATUS: DashboardNavigationStatus = {
  unreadNotifications: 0,
  credentialIssue: false,
  expiredApiKeys: 0,
};

interface DashboardSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  workspacePlan?: "FREE" | "PRO" | null;
  workspaceId?: string | null;
  workspaceUsage?: WorkspaceAccess["usage"];
  workspaceRestricted?: boolean;
  navigationStatus?: DashboardNavigationStatus;
}

export function DashboardSidebar({
  mobileOpen,
  onMobileClose,
  workspacePlan = null,
  workspaceId = null,
  workspaceUsage,
  workspaceRestricted = false,
  navigationStatus = DEFAULT_DASHBOARD_NAVIGATION_STATUS,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const defaultView = isAllWorkspacesPath(pathname);
  const { data: session } = useSession();
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const activeGroup = activeNavigationGroup(pathname)?.label ?? "Workspace";
  const defaultExpanded = useMemo(
    () =>
      new Set(
        dashboardNavigation
          .filter((group) => group.defaultOpen || group.label === activeGroup)
          .map((group) => group.label),
      ),
    [activeGroup],
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(defaultExpanded);
  const [mobileGroup, setMobileGroup] = useState(activeGroup);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored) {
      try {
        const values = JSON.parse(stored) as string[];
        setExpandedGroups(new Set([...values, activeGroup]));
      } catch {
        setExpandedGroups(defaultExpanded);
      }
    }
  }, [activeGroup, defaultExpanded]);

  useEffect(() => {
    setMobileGroup(activeGroup);
  }, [activeGroup]);

  useEffect(() => {
    function closeAccountMenu(event: PointerEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeAccountMenu);
    return () => document.removeEventListener("pointerdown", closeAccountMenu);
  }, []);

  const user = session?.user as
    { name?: string; email?: string; image?: string; plan?: string } | undefined;
  const initials = (user?.name ?? user?.email ?? "?")
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  function toggleDesktopGroup(label: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);

    try {
      const response = await fetch("/api/auth/signout", { method: "POST" });
      if (!response.ok) throw new Error("Could not sign out. Please try again.");

      // The app session is already gone. Firebase may be unavailable for local accounts,
      // so it must not keep the user on the dashboard after a successful sign-out.
      await Promise.race([
        Promise.resolve()
          .then(signOutFirebase)
          .catch(() => {}),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
      notifySessionChanged();
      navigateInApp("/", true);
    } catch {
      toast.error("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  function renderNavigation(mobile: boolean) {
    return visibleDashboardNavigation(workspaceRestricted).map((group, groupIndex) => {
      const open = mobile ? mobileGroup === group.label : expandedGroups.has(group.label);
      const panelId = `dashboard-nav-${mobile ? "mobile" : "desktop"}-${group.label.toLowerCase()}`;
      const groupHasStatus = group.items.some((item) => {
        const value = item.statusKey ? navigationStatus[item.statusKey] : 0;
        return value === true || (typeof value === "number" && value > 0);
      });

      return (
        <div key={group.label} className={groupIndex > 0 ? "mt-2" : undefined}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => {
              if (mobile) setMobileGroup((current) => (current === group.label ? "" : group.label));
              else toggleDesktopGroup(group.label);
            }}
            className="text-muted-foreground hover:bg-accent/60 hover:text-foreground focus-visible:ring-ring flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <span className="data-stamp flex-1 uppercase tracking-[0.12em]">{group.label}</span>
            {groupHasStatus ? <span className="bg-signal-orange h-1.5 w-1.5 rounded-full" /> : null}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </button>
          <div
            id={panelId}
            aria-hidden={!open}
            inert={!open ? true : undefined}
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
              open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="overflow-hidden">
              <div className="space-y-0.5 pb-1 pt-0.5">
                {group.items.map((item) => {
                  const { href, label, icon: Icon, statusKey } = item;
                  const restricted = item.minimumPlan === "PRO" && workspacePlan === "FREE";
                  const active = !restricted && navigationItemActive(pathname, item);
                  const statusValue = statusKey ? navigationStatus[statusKey] : 0;
                  const showStatus =
                    statusValue === true || (typeof statusValue === "number" && statusValue > 0);
                  return (
                    <Link
                      key={href}
                      href={restricted ? "/dashboard/billing" : href}
                      onClick={onMobileClose}
                      aria-current={active ? "page" : undefined}
                      aria-label={restricted ? `${label} — upgrade to Pro` : undefined}
                      title={restricted ? "Available on the Pro plan" : undefined}
                      className={cn(
                        "focus-visible:ring-ring group relative flex min-h-9 items-center gap-3 rounded-[5px] border border-transparent px-3 py-2 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2",
                        active
                          ? "border-signal-orange/25 bg-signal-orange/10 text-foreground shadow-sm"
                          : restricted
                            ? "text-muted-foreground/65 hover:border-signal-blue/30 hover:bg-signal-blue/5"
                            : "text-muted-foreground hover:border-border/80 hover:bg-accent/70 hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute inset-y-1.5 left-0 w-0.5 rounded-r-full transition-colors",
                          active
                            ? "bg-signal-orange"
                            : "group-hover:bg-signal-blue/60 bg-transparent",
                        )}
                      />
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          active ? "text-signal-orange" : "group-hover:text-signal-blue",
                        )}
                        strokeWidth={active ? 2.2 : 1.8}
                      />
                      <span className="truncate">{label}</span>
                      {restricted && (
                        <span className="border-border bg-muted text-muted-foreground ml-auto inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 font-mono text-[9px] font-semibold">
                          <LockKeyhole className="h-2.5 w-2.5" /> PRO
                        </span>
                      )}
                      {showStatus && !restricted && (
                        <span className="border-signal-orange/35 bg-signal-orange/10 text-signal-orange ml-auto flex h-5 min-w-5 items-center justify-center rounded-[3px] border px-1 font-mono text-[10px] font-semibold">
                          {statusValue === true
                            ? "!"
                            : typeof statusValue === "number" && statusValue > 99
                              ? "99+"
                              : statusValue}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );
    });
  }

  const sidebarContent = (mobile: boolean) => (
    <>
      <div className="app-shell-header-row border-border/80 flex items-center justify-between border-b px-5">
        <Link
          href={workspaceRestricted ? "/dashboard/upgrade" : "/dashboard"}
          className="flex items-center gap-2.5"
          onClick={onMobileClose}
        >
          <BrandLogo size="sm" />
        </Link>
        {onMobileClose && (
          <button
            type="button"
            onClick={onMobileClose}
            className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex items-center justify-center rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 md:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {mobile ? (
        <div className="border-border/80 bg-muted/20 shrink-0 border-b px-4 py-3 md:hidden">
          <p className="data-stamp text-muted-foreground mb-2 uppercase tracking-[0.12em]">
            Active workspace
          </p>
          <BusinessProfileSwitcher variant="sidebar" />
        </div>
      ) : null}

      <nav className="scroll-soft min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Dashboard">
        {workspaceRestricted && !defaultView ? (
          <Link
            href="/dashboard/billing"
            onClick={onMobileClose}
            className="text-signal-orange mb-3 block rounded-md border px-3 py-2 text-sm font-medium"
          >
            Upgrade to Pro
          </Link>
        ) : null}
        {defaultView ? (
          <div className="space-y-1">
            {[
              { href: DEFAULT_DASHBOARD_PATH, label: "Earnings overview", icon: LayoutDashboard },
              {
                href: ALL_WORKSPACES_PUBLISHING_PATH,
                label: "Publishing overview",
                icon: UploadCloud,
              },
            ].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={onMobileClose}
                aria-current={pathname === href ? "page" : undefined}
                className={cn(
                  "hover:bg-accent focus-visible:ring-ring flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2",
                  pathname === href && "bg-accent text-foreground",
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </div>
        ) : (
          renderNavigation(mobile)
        )}
      </nav>

      {!defaultView && (
        <WorkspacePlanBanner
          workspaceId={workspaceId}
          plan={workspacePlan}
          currentUsage={workspaceUsage}
        />
      )}

      <div
        ref={accountMenuRef}
        className="border-border/80 bg-muted/30 relative shrink-0 border-t p-3"
      >
        {accountOpen && (
          <div className="border-border bg-card absolute bottom-[calc(100%+0.5rem)] left-3 right-3 z-50 rounded-md border p-1.5 shadow-2xl">
            <p className="data-stamp text-muted-foreground px-2.5 pb-1.5 pt-1 text-[9px] uppercase tracking-[0.12em]">
              Account
            </p>
            {accountNavigation.map(({ id, href, label, icon: Icon }) => (
              <Link
                key={id}
                href={href}
                onClick={() => {
                  setAccountOpen(false);
                  onMobileClose?.();
                }}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex min-w-0 items-center gap-2.5 rounded-sm px-2.5 py-2 text-xs font-medium transition-colors"
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="truncate">{label}</span>
              </Link>
            ))}
            <div className="border-border/70 mt-1 border-t pt-1">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-60"
              >
                <LogOut className="h-3.5 w-3.5" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setAccountOpen((value) => !value)}
          aria-expanded={accountOpen}
          aria-haspopup="menu"
          className="border-border/70 bg-card hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
        >
          <Avatar className="border-border h-8 w-8 border">
            {user?.image ? <AvatarImage src={user.image} alt={user?.name ?? ""} /> : null}
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate text-[13px] font-semibold">{user?.name ?? "User"}</p>
            <p className="text-muted-foreground truncate font-mono text-[10px] uppercase tracking-[0.08em]">
              Profile &amp; account
            </p>
          </div>
          <ChevronUp
            className={cn(
              "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
              accountOpen && "rotate-180",
            )}
          />
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside className="border-border/80 bg-card sticky top-0 hidden h-dvh w-[248px] min-w-0 shrink-0 basis-[248px] border-r md:flex md:flex-col">
        {sidebarContent(false)}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <button
            type="button"
            className="bg-ink/70 fixed inset-0 z-40 backdrop-blur-sm md:hidden"
            onClick={onMobileClose}
            aria-label="Close navigation"
          />
          <aside className="border-border bg-card fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r shadow-2xl md:hidden">
            {sidebarContent(true)}
          </aside>
        </>
      )}
    </>
  );
}
