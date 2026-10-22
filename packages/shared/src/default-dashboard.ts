/** All Workspaces is an account-wide view, never a persisted workspace. */
export const DEFAULT_DASHBOARD_PATH = "/dashboard/default";
export const ALL_WORKSPACES_PUBLISHING_PATH = `${DEFAULT_DASHBOARD_PATH}/publishing`;

export function isAllWorkspacesPath(pathname: string) {
  return pathname === DEFAULT_DASHBOARD_PATH || pathname.startsWith(`${DEFAULT_DASHBOARD_PATH}/`);
}

export interface PublishingOverviewPayload {
  summary: {
    actors: number;
    published: number;
    private: number;
    unknown: number;
    schedules: number;
    activeSchedules: number;
    pending: number;
    queuedPublished: number;
    failed: number;
    blocked: number;
  };
  workspaces: Array<{
    id: string;
    name: string;
    actors: number;
    published: number;
    private: number;
    unknown: number;
    schedules: number;
  }>;
  schedules: Array<{
    id: string;
    name: string;
    workspaceId: string;
    workspaceName: string;
    enabled: boolean;
    nextRunAt: string | null;
    quotaBlockedUntil: string | null;
    actors: number;
    pending: number;
    published: number;
    failed: number;
    blocked: number;
    lastRun: { status: string; publishedCount: number; startedAt: string } | null;
  }>;
  operations: Array<{
    id: string;
    workspaceId: string;
    workspaceName: string;
    action: string;
    status: string;
    actorCount: number;
    succeededCount: number;
    failedCount: number;
    createdAt: string;
  }>;
  page: number;
  pageSize: number;
  totalSchedules: number;
}

export interface EarningsSummary {
  revenueUsd: number | null;
  usageCostUsd: number | null;
  earningsUsd: number | null;
  runs: number;
}

export interface DefaultDashboardPayload {
  from: string;
  to: string;
  timeZone: "UTC";
  billingMonth: string;
  currentBillingRevenueUsd: number | null;
  billingWorkspacesCovered: number;
  summary: EarningsSummary;
  daily: Array<EarningsSummary & { date: string; workspacesCovered: number }>;
  workspaces: Array<
    EarningsSummary & {
      id: string;
      name: string;
      currentBillingRevenueUsd: number | null;
      syncedAt: string | null;
      revenueAvailable: boolean;
      usageAvailable: boolean;
      partial: boolean;
    }
  >;
  partial: boolean;
}
