"use client";

import { usePathname } from "next/navigation";
import { workspaceApifySetupReason } from "@/lib/workspace-apify-connection";
import { useWorkspaceApifyConnection } from "./workspace-apify-connection-context";
import { WorkspaceApifySetup } from "./workspace-apify-setup";

export function WorkspaceApifyConnectionBanner({ workspaceId }: { workspaceId: string | null }) {
  const pathname = usePathname();
  const connection = useWorkspaceApifyConnection();
  if (
    !workspaceId ||
    connection.workspaceId !== workspaceId ||
    connection.loading ||
    pathname === "/dashboard/apify" ||
    pathname === "/dashboard/onboarding"
  )
    return null;
  const requirement =
    pathname === "/dashboard/costs" || pathname === "/dashboard/revenue" ? "console" : "api";
  const reason = workspaceApifySetupReason(connection.status, requirement);
  if (!reason) return null;
  const hasSetupPage =
    ["/dashboard/usage", "/dashboard/costs", "/dashboard/revenue"].includes(pathname) ||
    pathname === "/dashboard/publishing" ||
    pathname.startsWith("/dashboard/publishing/") ||
    /^\/dashboard\/actors\/[^/]+\/runs\/[^/]+$/.test(pathname);
  // These pages render their own full setup panel before loading dependent data.
  if (hasSetupPage && reason !== "console") return null;
  return (
    <div className="border-b border-border px-5 py-4">
      <WorkspaceApifySetup reason={reason} compact onRetry={connection.refresh} />
    </div>
  );
}
