import type { Plan } from "./types/user";
import type { WorkspacePlanUsage } from "./plans";

export interface WorkspaceAccess {
  workspaceId: string | null;
  plan: Plan;
  restricted: boolean;
  usage:
    (WorkspacePlanUsage & { monthlyUsersComplete?: boolean; checkedAt?: string | null }) | null;
}

export const WORKSPACE_ACCESS_HEADER = "x-actorconsole-workspace-access";
export const WORKSPACE_UPGRADE_PATH = "/dashboard/upgrade";

const alwaysAvailableDashboardPaths = [
  "/dashboard/default",
  WORKSPACE_UPGRADE_PATH,
  "/dashboard/keywords",
  "/dashboard/research",
  "/dashboard/tools/pricing",
  "/dashboard/tools/seo",
  "/dashboard/watchlist",
  "/dashboard/mcp",
  "/dashboard/apify",
  "/dashboard/support",
  "/dashboard/billing",
  "/dashboard/onboarding",
  "/dashboard/profile",
  "/dashboard/notification-preferences",
  "/dashboard/notifications",
  "/dashboard/data-export",
  "/dashboard/account",
  "/dashboard/forbidden",
  "/dashboard/settings",
];

function within(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`);
}

export function isRestrictedDashboardPath(pathname: string): boolean {
  return (
    within(pathname, "/dashboard") &&
    !alwaysAvailableDashboardPaths.some((path) => within(pathname, path))
  );
}

/** Setup/discovery remain available; operational data and actions share the same gate. */
export function isRestrictedWorkspaceApiPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/actors/plan-usage") return false;
  return (
    within(path, "/actors") ||
    (within(path, "/intelligence") && !within(path, "/intelligence/watches")) ||
    within(path, "/bulk-publishing") ||
    path === "/account/dashboard-summary" ||
    path === "/apify/operations"
  );
}

export function isWorkspaceAccess(value: unknown): value is WorkspaceAccess {
  if (!value || typeof value !== "object") return false;
  const access = value as WorkspaceAccess;
  return (
    (access.plan === "FREE" || access.plan === "PRO") &&
    typeof access.restricted === "boolean" &&
    (access.workspaceId === null || typeof access.workspaceId === "string") &&
    (access.usage === null ||
      Boolean(
        access.usage &&
        typeof access.usage.actorCount === "number" &&
        typeof access.usage.upgradeRequired === "boolean",
      ))
  );
}
