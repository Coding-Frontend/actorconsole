"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { API_BASE_URL } from "@/lib/api-base";
import { WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "@/components/dashboard/dashboard-navigation";
import {
  workspaceApifySetupReason,
  type WorkspaceApifyConnection,
} from "@/lib/workspace-apify-connection";
import { WorkspaceApifySetup } from "./workspace-apify-setup";

export function WorkspaceApifyConnectionBanner({ workspaceId }: { workspaceId: string | null }) {
  const pathname = usePathname();
  const [result, setResult] = useState<{
    workspaceId: string;
    status: WorkspaceApifyConnection | null;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    let requestId = 0;
    const load = async () => {
      const current = ++requestId;
      let status: WorkspaceApifyConnection | null = null;
      try {
        const response = await fetch(`${API_BASE_URL}/apify/status`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
          headers: { "x-business-profile-id": workspaceId },
        });
        if (response.ok) {
          const body = await response.json();
          if (typeof body.data?.connected === "boolean") status = body.data;
        }
      } catch {
        /* A status failure is distinct from a missing connection. */
      }
      if (!controller.signal.aborted && current === requestId) setResult({ workspaceId, status });
    };
    void load();
    window.addEventListener(WORKSPACE_DATA_REFRESHED_EVENT, load);
    window.addEventListener(DASHBOARD_STATUS_CHANGED_EVENT, load);
    return () => {
      controller.abort();
      window.removeEventListener(WORKSPACE_DATA_REFRESHED_EVENT, load);
      window.removeEventListener(DASHBOARD_STATUS_CHANGED_EVENT, load);
    };
  }, [workspaceId, retry]);
  if (
    !workspaceId ||
    result?.workspaceId !== workspaceId ||
    pathname === "/dashboard/apify" ||
    pathname === "/dashboard/onboarding"
  )
    return null;
  const requirement =
    pathname === "/dashboard/costs" || pathname === "/dashboard/revenue" ? "console" : "api";
  const reason = workspaceApifySetupReason(result.status, requirement);
  if (!reason) return null;
  const hasSetupPage =
    ["/dashboard/usage", "/dashboard/costs", "/dashboard/revenue"].includes(pathname) ||
    pathname === "/dashboard/publishing" ||
    pathname.startsWith("/dashboard/publishing/") ||
    /^\/dashboard\/actors\/[^/]+\/runs\/[^/]+$/.test(pathname);
  // These pages render their own full setup panel before loading dependent data.
  if (hasSetupPage && reason !== "console") return null;
  return (
    <div className="border-border border-b px-5 py-4">
      <WorkspaceApifySetup reason={reason} compact onRetry={() => setRetry((value) => value + 1)} />
    </div>
  );
}
