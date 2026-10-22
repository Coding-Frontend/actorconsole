"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DashboardSidebar,
  DEFAULT_DASHBOARD_NAVIGATION_STATUS,
  type DashboardNavigationStatus,
} from "@/components/dashboard/sidebar";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { PolicyAcceptanceBanner } from "@/components/marketing/policy-acceptance-banner";
import { CommandPalette, useCommandPalette } from "@/components/dashboard/command-palette";
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";
import { WorkspaceDataRefresher } from "@/components/dashboard/workspace-data-refresher";
import { WorkspaceApifyConnectionBanner } from "@/components/dashboard/workspace-apify-connection-banner";
import { API_BASE_URL } from "@/lib/api-base";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "@/components/dashboard/dashboard-navigation";
import { WORKSPACE_CHANGED_EVENT } from "@/components/dashboard/onboarding-gate";
import { usePathname, useRouter } from "next/navigation";
import {
  isRestrictedDashboardPath,
  isWorkspaceAccess,
  WORKSPACE_UPGRADE_PATH,
  type WorkspaceAccess,
} from "@actorconsole/shared/workspace-access";
import { WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
import { WorkspaceAccessContext } from "./workspace-access-context";
import { WorkspaceUpgradeScreen } from "./workspace-upgrade-screen";
import type { MimicStatus } from "@/lib/impersonation";
import { isAllWorkspacesPath } from "@actorconsole/shared/default-dashboard";

export function DashboardShell({
  children,
  mimicStatus = null,
  initialAccess = null,
  skipWorkspaceAccess = false,
}: {
  children: React.ReactNode;
  mimicStatus?: MimicStatus | null;
  initialAccess?: WorkspaceAccess | null;
  skipWorkspaceAccess?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const defaultView = isAllWorkspacesPath(pathname);
  const [access, setAccess] = useState<WorkspaceAccess | null>(initialAccess);
  const [accessLoading, setAccessLoading] = useState(!initialAccess);
  const [accessError, setAccessError] = useState(false);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const lastStatusCheck = useRef(0);
  const bootstrapAccessCheck = useRef(!initialAccess || pathname === WORKSPACE_UPGRADE_PATH);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette();
  const [workspacePlan, setWorkspacePlan] = useState<"FREE" | "PRO" | null>(
    initialAccess?.plan ?? null,
  );
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    initialAccess?.workspaceId ?? null,
  );
  const [navigationStatus, setNavigationStatus] = useState<DashboardNavigationStatus>(
    DEFAULT_DASHBOARD_NAVIGATION_STATUS,
  );

  const loadNavigationStatus = useCallback(
    async (includeAccess = true) => {
      lastStatusCheck.current = Date.now();
      const request = ++requestRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      if (includeAccess) setAccessLoading(true);
      try {
        const [statusResult, accessResult] = await Promise.allSettled([
          fetch(`${API_BASE_URL}/account/navigation-status`, {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          }).then(async (response) => (response.ok ? (await response.json()).data : null)),
          skipWorkspaceAccess || !includeAccess
            ? Promise.resolve(null)
            : fetch(`${API_BASE_URL}/account/workspace-access`, {
                credentials: "include",
                cache: "no-store",
                signal: controller.signal,
              }).then(async (response) => (response.ok ? (await response.json()).data : null)),
        ]);
        if (controller.signal.aborted || request !== requestRef.current) return;
        if (statusResult.status === "fulfilled" && statusResult.value) {
          const body = statusResult.value;
          setNavigationStatus({
            unreadNotifications: body.unreadNotifications ?? 0,
            credentialIssue: body.credentialIssue ?? false,
            expiredApiKeys: body.expiredApiKeys ?? 0,
          });
        }
        if (accessResult.status === "fulfilled" && isWorkspaceAccess(accessResult.value)) {
          const result = accessResult.value;
          setAccess(result);
          setActiveWorkspaceId(result.workspaceId);
          setWorkspacePlan(result.plan);
          setAccessError(false);
        } else if (!skipWorkspaceAccess && includeAccess) setAccessError(true);
      } finally {
        if (request === requestRef.current && !controller.signal.aborted) setAccessLoading(false);
      }
    },
    [skipWorkspaceAccess],
  );

  useEffect(() => {
    if (initialAccess) {
      setAccess(initialAccess);
      setActiveWorkspaceId(initialAccess.workspaceId);
      setWorkspacePlan(initialAccess.plan);
    }
  }, [initialAccess]);

  useEffect(() => {
    // The server just validated access. Reuse it during hydration; upgrade
    // screens still recheck for payments that completed during that render.
    void loadNavigationStatus(bootstrapAccessCheck.current);
    const changed = () => {
      setAccess(null);
      setActiveWorkspaceId(null);
      setWorkspacePlan(null);
      void loadNavigationStatus();
    };
    const reload = () => void loadNavigationStatus();
    const focus = () => {
      if (document.visibilityState === "visible" && Date.now() - lastStatusCheck.current >= 30_000)
        reload();
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, changed);
    window.addEventListener(DASHBOARD_STATUS_CHANGED_EVENT, reload);
    window.addEventListener(WORKSPACE_DATA_REFRESHED_EVENT, reload);
    window.addEventListener("focus", focus);
    const timer = window.setInterval(focus, 60_000);
    return () => {
      controllerRef.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, changed);
      window.removeEventListener(DASHBOARD_STATUS_CHANGED_EVENT, reload);
      window.removeEventListener(WORKSPACE_DATA_REFRESHED_EVENT, reload);
      window.removeEventListener("focus", focus);
    };
  }, [loadNavigationStatus]);

  useEffect(() => {
    if (skipWorkspaceAccess || accessLoading || accessError || !access) return;
    if (access.restricted && isRestrictedDashboardPath(pathname))
      router.replace(WORKSPACE_UPGRADE_PATH);
    else if (!access.restricted && pathname === WORKSPACE_UPGRADE_PATH)
      router.replace("/dashboard");
  }, [access, accessLoading, accessError, pathname, router, skipWorkspaceAccess]);

  const workspaceRestricted = !skipWorkspaceAccess && (accessError || (access?.restricted ?? true));
  const operationalPage = !skipWorkspaceAccess && isRestrictedDashboardPath(pathname);
  const content =
    operationalPage && (accessError || access?.restricted) ? (
      <WorkspaceUpgradeScreen access={access} error={accessError} refresh={loadNavigationStatus} />
    ) : operationalPage && !access ? (
      <p role="status">Checking workspace access…</p>
    ) : (
      children
    );

  return (
    <WorkspaceAccessContext.Provider
      value={{ access, loading: accessLoading, error: accessError, refresh: loadNavigationStatus }}
    >
      <div className="app-shell bg-background flex min-h-dvh w-full min-w-0">
        <DashboardSidebar
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
          workspacePlan={workspacePlan}
          workspaceId={activeWorkspaceId}
          workspaceUsage={access?.usage ?? null}
          workspaceRestricted={workspaceRestricted}
          navigationStatus={navigationStatus}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="bg-background sticky top-0 z-30">
            <ImpersonationBanner status={mimicStatus} />
            <DashboardTopbar
              onMenuToggle={() => setSidebarOpen(true)}
              onCmdK={() => setCmdOpen(true)}
              unreadNotifications={Number(navigationStatus.unreadNotifications) || 0}
            />
          </div>
          <AnnouncementBanner />
          <PolicyAcceptanceBanner />
          {!defaultView && <WorkspaceApifyConnectionBanner workspaceId={activeWorkspaceId} />}
          {!defaultView && (
            <WorkspaceDataRefresher
              workspaceId={activeWorkspaceId}
              disabled={workspaceRestricted}
            />
          )}
          <main className="blueprint-surface app-shell-main bg-muted/25 relative min-w-0 flex-1">
            <div className="bg-signal-blue/35 pointer-events-none absolute inset-x-0 top-0 h-px" />
            <div className="app-shell-content-container py-4 sm:py-6 lg:py-8">{content}</div>
          </main>
        </div>
        {!defaultView && (
          <CommandPalette
            open={cmdOpen}
            onClose={() => setCmdOpen(false)}
            workspacePlan={workspacePlan ?? "FREE"}
            workspaceRestricted={workspaceRestricted}
          />
        )}
      </div>
    </WorkspaceAccessContext.Provider>
  );
}
