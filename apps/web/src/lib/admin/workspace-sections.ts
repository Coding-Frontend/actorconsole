export const workspaceSections = [
  {
    id: "actors",
    label: "Apify Actors",
    count: "actors",
    dashboard: "/dashboard/actors",
    columns: [
      "title",
      "actorName",
      "username",
      "storeIsPublic",
      "storeIsDeprecated",
      "publishReady",
      "lastOperationalSyncAt",
    ],
  },
  {
    id: "schedules",
    label: "Schedules",
    count: "bulkPublishSchedules",
    dashboard: "/dashboard/publishing/schedules",
    columns: [
      "name",
      "cronExpr",
      "dailyLimit",
      "enabled",
      "_count.actors",
      "lastRunAt",
      "nextRunAt",
    ],
  },
  {
    id: "notifications",
    label: "Notifications",
    count: "notifications",
    dashboard: "/dashboard/notifications",
    columns: ["title", "type", "body", "readAt", "createdAt"],
  },
  {
    id: "operations",
    label: "Publishing history",
    count: "bulkActorStatusOperations",
    dashboard: "/dashboard/publishing",
    columns: [
      "action",
      "status",
      "actorCount",
      "succeededCount",
      "failedCount",
      "error",
      "createdAt",
    ],
  },
  {
    id: "improvements",
    label: "Improvements",
    count: "actorOptimizationRuns",
    dashboard: "/dashboard/actors/improvements",
    columns: [
      "kind",
      "status",
      "totalCount",
      "completedCount",
      "appliedCount",
      "failedCount",
      "createdAt",
    ],
  },
  { id: "usage", label: "Usage", dashboard: "/dashboard/usage", columns: [] },
  { id: "costs", label: "Costs", dashboard: "/dashboard/costs", columns: [] },
  { id: "revenue", label: "Revenue", dashboard: "/dashboard/revenue", columns: [] },
  {
    id: "keywords",
    label: "Keyword research",
    count: "keywordWatches",
    dashboard: "/dashboard/keywords",
    columns: ["keyword", "searchCount", "latestResultCount", "difficultyScore", "lastSearchedAt"],
  },
  {
    id: "searches",
    label: "Search history",
    count: "keywordSearches",
    dashboard: "/dashboard/keywords",
    columns: ["keyword", "resultCount", "difficultyScore", "createdAt"],
  },
  {
    id: "api-keys",
    label: "MCP / API keys",
    count: "apiKeys",
    dashboard: "/dashboard/mcp",
    columns: ["name", "keyPreview", "scopes", "lastUsedAt", "expiresAt", "revokedAt"],
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    count: "subscriptions",
    dashboard: "/dashboard/billing",
    columns: ["provider", "status", "currentPeriodEnd", "cancelAtPeriodEnd", "createdAt"],
  },
  {
    id: "payments",
    label: "Payments",
    count: "payments",
    dashboard: "/dashboard/billing",
    columns: ["provider", "amount", "currency", "status", "createdAt"],
  },
  {
    id: "support",
    label: "Support",
    count: "tickets",
    dashboard: "/dashboard/support",
    columns: ["number", "subject", "status", "priority", "createdAt"],
  },
  {
    id: "activity",
    label: "Activity",
    dashboard: "/dashboard/activity",
    columns: ["action", "resource", "source", "createdAt"],
  },
  { id: "apify", label: "Apify connection", dashboard: "/dashboard/apify", columns: [] },
  {
    id: "preferences",
    label: "Notification preferences",
    dashboard: "/dashboard/notification-preferences",
    columns: [],
  },
] as const;

export type AdminWorkspaceSection = (typeof workspaceSections)[number];

export interface AdminWorkspaceData {
  workspace: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    industry: string | null;
    website: string | null;
    isDefault: boolean;
    createdAt: string;
    user: {
      id: string;
      name: string | null;
      email: string;
      role: string;
      suspendedAt: string | null;
      deletionScheduledFor: string | null;
    };
    _count: Record<string, number>;
    apifyTokens: Array<Record<string, unknown>>;
    notificationPreference: Record<string, boolean> | null;
  };
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  limit: number;
}
