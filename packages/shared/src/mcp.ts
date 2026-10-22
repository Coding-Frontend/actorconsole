import type { McpCapability } from "./types/user.js";

export const MCP_TOOL_NAMES = [
  "get_workspace",
  "get_mcp_capabilities",
  "get_mcp_usage",
  "list_actors",
  "get_actor",
  "list_published_actors",
  "list_maintenance_actors",
  "list_deprecated_actors",
  "list_unpublished_actors",
  "list_publish_ready_actors",
  "sync_actors",
  "list_notifications",
  "get_unread_notification_count",
  "mark_notification_read",
  "mark_all_notifications_read",
  "analyze_actor",
  "rewrite_actor_title_description",
  "rewrite_actor_listing",
  "create_actor_optimization_run",
  "get_actor_optimization_run",
  "apply_actor_changes",
  "get_actor_change_status",
  "get_pricing",
  "set_pricing",
  "recommend_pricing",
  "get_pricing_history",
  "search_actors",
  "keyword_competitors",
  "get_usage_costs",
  "get_actor_performance",
  "get_actor_revenue",
  "get_workspace_usage",
  "get_workspace_revenue",
  "get_usage_history",
  "change_actor_store_status",
  "list_actor_status_operations",
  "get_actor_status_operation",
  "list_publishing_schedules",
  "get_publishing_schedule",
  "create_publishing_schedule",
  "update_publishing_schedule",
  "add_actors_to_publishing_schedule",
  "remove_actors_from_publishing_schedule",
  "pause_publishing_schedule",
  "resume_publishing_schedule",
  "run_publishing_schedule",
  "list_publishing_runs",
  "get_publishing_run",
  "requeue_publishing_actor",
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

/** Public reference rendered by the dashboard documentation. Keep each tool's
 * behavior here in step with its MCP registration and API route. */
export const MCP_TOOL_SUMMARIES: Record<McpToolName, string> = {
  get_workspace: "Read the workspace and Apify connection status bound to this credential.",
  get_mcp_capabilities:
    "List this credential's permissions, Actor scope, tools, resources, and prompts.",
  get_mcp_usage: "Read this credential's per-tool calls, failures, latency, and last use.",
  list_actors:
    "Page through synchronized tracked Actors with status, search, and readiness filters.",
  get_actor: "Read one tracked Actor's cached metadata and recent copy and pricing history.",
  list_published_actors: "List public Actors that are neither deprecated nor under maintenance.",
  list_maintenance_actors: "List tracked Actors marked as under maintenance.",
  list_deprecated_actors: "List tracked Actors marked as deprecated.",
  list_unpublished_actors: "List tracked private Actors.",
  list_publish_ready_actors: "List Actors whose synchronized listing passes readiness checks.",
  sync_actors: "Synchronize the tracked Actor inventory from the connected Apify account.",
  list_notifications: "Page and filter workspace and available Apify notifications.",
  get_unread_notification_count: "Count unread workspace and available Apify notifications.",
  mark_notification_read: "Mark one workspace or Apify notification as read.",
  mark_all_notifications_read:
    "Mark local notifications read and attempt the same for Apify notifications.",
  analyze_actor: "Queue an Actor listing audit with reviewable improvement proposals.",
  rewrite_actor_title_description: "Queue reviewable title and description proposals.",
  rewrite_actor_listing: "Queue reviewable title and description proposals.",
  create_actor_optimization_run: "Queue proposal generation for selected Actors and fields.",
  get_actor_optimization_run: "Read a proposal run's results, scores, issues, and status.",
  apply_actor_changes: "Approve selected proposal fields and queue application to Apify.",
  get_actor_change_status:
    "Read the same proposal run status returned by get_actor_optimization_run.",
  get_pricing: "Read one Actor's synchronized current pay-per-event pricing.",
  set_pricing: "Apply pay-per-event pricing and record a change when Apify accepts it.",
  recommend_pricing: "Compare live Store listings and return a median-price recommendation.",
  get_pricing_history: "Read up to 180 recorded pricing changes, newest first.",
  search_actors:
    "Search the synchronized public Store catalog and return results with demand metrics.",
  keyword_competitors: "Return public Store matches and search metrics for a keyword.",
  get_usage_costs: "Read one Actor's synchronized runs and platform costs by day or month.",
  get_actor_performance: "Read one Actor's cached run, result, success, and platform-cost metrics.",
  get_actor_revenue:
    "Read one Actor's creator revenue, costs, profit, coverage, and report points.",
  get_workspace_usage: "Read workspace usage, costs, runs, and per-Actor data.",
  get_workspace_revenue: "Read workspace revenue, cost, profit, margin, and Actor data.",
  get_usage_history: "Read the combined workspace usage and revenue history.",
  change_actor_store_status:
    "Queue immediate maintenance or deprecated status changes for selected Actors.",
  list_actor_status_operations: "Page through durable Store status operations.",
  get_actor_status_operation: "Read one Store status operation and its per-Actor results.",
  list_publishing_schedules: "List workspace publishing schedules and recent runs.",
  get_publishing_schedule: "Read one ordered publishing schedule and recent runs.",
  create_publishing_schedule: "Create an ordered schedule, paused by default.",
  update_publishing_schedule: "Edit schedule settings or replace its ordered Actor queue.",
  add_actors_to_publishing_schedule: "Add Actors to a publishing schedule queue.",
  remove_actors_from_publishing_schedule: "Remove Actors from a publishing schedule queue.",
  pause_publishing_schedule: "Pause a publishing schedule.",
  resume_publishing_schedule: "Resume a publishing schedule.",
  run_publishing_schedule: "Queue an immediate publishing run, subject to Apify quota.",
  list_publishing_runs: "List recent execution records for a schedule.",
  get_publishing_run: "Read one execution record and its per-Actor results.",
  requeue_publishing_actor: "Move one blocked or failed Actor back to pending.",
};

/** Client-visible input guide for every registered tool. Names and defaults
 * mirror the schemas in apps/mcp/src/tools. */
export const MCP_TOOL_INPUTS: Record<McpToolName, string> = {
  get_workspace: "None.",
  get_mcp_capabilities: "None.",
  get_mcp_usage: "days (optional, 1–90; default 30).",
  list_actors:
    "status, page, limit (1–500), search, readiness (all optional; page 1 and limit 100 by default).",
  get_actor: "apifyActorId (required).",
  list_published_actors: "limit (optional, 1–500; default 100).",
  list_maintenance_actors: "limit (optional, 1–500; default 100).",
  list_deprecated_actors: "limit (optional, 1–500; default 100).",
  list_unpublished_actors: "limit (optional, 1–500; default 100).",
  list_publish_ready_actors: "limit (optional, 1–500; default 100).",
  sync_actors: "None.",
  list_notifications:
    "unreadOnly, source, type, from/to ISO timestamps, page (1–100), limit (1–100); all optional.",
  get_unread_notification_count: "None.",
  mark_notification_read: "notificationId (required).",
  mark_all_notifications_read: "None.",
  analyze_actor: "apifyActorId (required).",
  rewrite_actor_title_description: "apifyActorId (required).",
  rewrite_actor_listing: "apifyActorId (required).",
  create_actor_optimization_run:
    "actorIds (1–10,000 ActorConsole or Apify Actor IDs) and fields (required); kind (optional, default CUSTOM).",
  get_actor_optimization_run: "runId (required).",
  apply_actor_changes:
    "runId, items (resultId plus selected fields), and idempotencyKey (all required).",
  get_actor_change_status: "runId (required).",
  get_pricing: "apifyActorId (required).",
  set_pricing: "apifyActorId and pricing (required); reason (optional).",
  recommend_pricing: "apifyActorId (required).",
  get_pricing_history: "apifyActorId (required); limit (optional, 1–180; default 60).",
  search_actors: "query (required); limit (optional, 1–50; default 20).",
  keyword_competitors: "keyword (required); limit (optional, 1–50; default 20).",
  get_usage_costs:
    "apifyActorId (required); days (1–365, default 30), granularity, and mode (optional).",
  get_actor_performance: "apifyActorId (required); limit (optional, 1–180 days; default 60).",
  get_actor_revenue:
    "apifyActorId (required); limit (1–180 days, default 90), granularity, and mode (optional).",
  get_workspace_usage: "granularity (day/month) and mode (absolute/cumulative); both optional.",
  get_workspace_revenue: "granularity (day/month) and mode (absolute/cumulative); both optional.",
  get_usage_history: "granularity (day/month) and mode (absolute/cumulative); both optional.",
  change_actor_store_status:
    "actorIds (ActorConsole IDs), action, and idempotencyKey (all required).",
  list_actor_status_operations: "page (default 1) and limit (1–100, default 20); both optional.",
  get_actor_status_operation: "operationId (required).",
  list_publishing_schedules: "None.",
  get_publishing_schedule: "scheduleId (required).",
  create_publishing_schedule:
    "name, actorIds (ActorConsole IDs), and idempotencyKey (required); cronExpr, dailyLimit, and enabled (optional).",
  update_publishing_schedule:
    "scheduleId and idempotencyKey (required); name, actorIds, cronExpr, dailyLimit, and enabled (optional).",
  add_actors_to_publishing_schedule:
    "scheduleId, actorIds (ActorConsole IDs), and idempotencyKey (all required).",
  remove_actors_from_publishing_schedule:
    "scheduleId, actorIds (ActorConsole IDs), and idempotencyKey (all required).",
  pause_publishing_schedule: "scheduleId and idempotencyKey (required).",
  resume_publishing_schedule: "scheduleId and idempotencyKey (required).",
  run_publishing_schedule: "scheduleId and idempotencyKey (required).",
  list_publishing_runs: "scheduleId (required).",
  get_publishing_run: "scheduleId and runId (required).",
  requeue_publishing_actor:
    "scheduleId, actorId (ActorConsole ID), and idempotencyKey (all required).",
};

export const MCP_TOOL_GROUPS: ReadonlyArray<{ label: string; tools: readonly McpToolName[] }> = [
  { label: "Workspace", tools: ["get_workspace", "get_mcp_capabilities", "get_mcp_usage"] },
  {
    label: "Actors",
    tools: [
      "list_actors",
      "get_actor",
      "list_published_actors",
      "list_maintenance_actors",
      "list_deprecated_actors",
      "list_unpublished_actors",
      "list_publish_ready_actors",
      "sync_actors",
    ],
  },
  {
    label: "Notifications",
    tools: [
      "list_notifications",
      "get_unread_notification_count",
      "mark_notification_read",
      "mark_all_notifications_read",
    ],
  },
  {
    label: "Optimization",
    tools: [
      "analyze_actor",
      "rewrite_actor_title_description",
      "rewrite_actor_listing",
      "create_actor_optimization_run",
      "get_actor_optimization_run",
      "apply_actor_changes",
      "get_actor_change_status",
    ],
  },
  {
    label: "Pricing and Store research",
    tools: [
      "get_pricing",
      "set_pricing",
      "recommend_pricing",
      "get_pricing_history",
      "search_actors",
      "keyword_competitors",
    ],
  },
  {
    label: "Usage and revenue",
    tools: [
      "get_usage_costs",
      "get_actor_performance",
      "get_actor_revenue",
      "get_workspace_usage",
      "get_workspace_revenue",
      "get_usage_history",
    ],
  },
  {
    label: "Publishing",
    tools: [
      "change_actor_store_status",
      "list_actor_status_operations",
      "get_actor_status_operation",
      "list_publishing_schedules",
      "get_publishing_schedule",
      "create_publishing_schedule",
      "update_publishing_schedule",
      "add_actors_to_publishing_schedule",
      "remove_actors_from_publishing_schedule",
      "pause_publishing_schedule",
      "resume_publishing_schedule",
      "run_publishing_schedule",
      "list_publishing_runs",
      "get_publishing_run",
      "requeue_publishing_actor",
    ],
  },
];

export const MCP_TOOL_CAPABILITIES: Partial<Record<McpToolName, McpCapability>> = {
  get_workspace: "workspace:read",
  get_mcp_usage: "workspace:read",
  list_actors: "actors:read",
  get_actor: "actors:read",
  list_published_actors: "actors:read",
  list_maintenance_actors: "actors:read",
  list_deprecated_actors: "actors:read",
  list_unpublished_actors: "actors:read",
  list_publish_ready_actors: "actors:read",
  sync_actors: "actors:sync",
  list_notifications: "notifications:read",
  get_unread_notification_count: "notifications:read",
  mark_notification_read: "notifications:write",
  mark_all_notifications_read: "notifications:write",
  analyze_actor: "actors:optimize",
  rewrite_actor_title_description: "actors:optimize",
  rewrite_actor_listing: "actors:optimize",
  create_actor_optimization_run: "actors:optimize",
  get_actor_optimization_run: "actors:optimize",
  get_actor_change_status: "actors:optimize",
  apply_actor_changes: "actors:write",
  get_pricing: "pricing:read",
  recommend_pricing: "pricing:read",
  get_pricing_history: "pricing:read",
  set_pricing: "pricing:write",
  search_actors: "actors:read",
  keyword_competitors: "actors:read",
  get_usage_costs: "usage:read",
  get_actor_performance: "usage:read",
  get_actor_revenue: "usage:read",
  get_workspace_usage: "usage:read",
  get_workspace_revenue: "usage:read",
  get_usage_history: "usage:read",
  change_actor_store_status: "publishing:write",
  list_actor_status_operations: "publishing:read",
  get_actor_status_operation: "publishing:read",
  list_publishing_schedules: "publishing:read",
  get_publishing_schedule: "publishing:read",
  list_publishing_runs: "publishing:read",
  get_publishing_run: "publishing:read",
  create_publishing_schedule: "publishing:write",
  update_publishing_schedule: "publishing:write",
  add_actors_to_publishing_schedule: "publishing:write",
  remove_actors_from_publishing_schedule: "publishing:write",
  pause_publishing_schedule: "publishing:write",
  resume_publishing_schedule: "publishing:write",
  requeue_publishing_actor: "publishing:write",
  run_publishing_schedule: "publishing:run",
};

/** Extra permissions enforced by the API in addition to the tool's primary group. */
export const MCP_TOOL_ADDITIONAL_CAPABILITIES: Partial<
  Record<McpToolName, readonly McpCapability[]>
> = {
  change_actor_store_status: ["actors:write"],
};

export const MCP_RESOURCE_URIS = [
  "actorconsole://workspace",
  "actorconsole://actors",
  "actorconsole://actors/{actorId}",
  "actorconsole://notifications",
  "actorconsole://publishing/schedules",
] as const;

export const MCP_RESOURCE_CAPABILITIES: Record<(typeof MCP_RESOURCE_URIS)[number], McpCapability> =
  {
    "actorconsole://workspace": "workspace:read",
    "actorconsole://actors": "actors:read",
    "actorconsole://actors/{actorId}": "actors:read",
    "actorconsole://notifications": "notifications:read",
    "actorconsole://publishing/schedules": "publishing:read",
  };

export const MCP_PROMPT_NAMES = [
  "optimize_actor_listing",
  "triage_maintenance_actors",
  "prepare_publishing_schedule",
  "review_deprecated_actors",
] as const;

export const MCP_PROMPT_CAPABILITIES: Record<(typeof MCP_PROMPT_NAMES)[number], McpCapability> = {
  optimize_actor_listing: "actors:optimize",
  triage_maintenance_actors: "actors:read",
  prepare_publishing_schedule: "publishing:write",
  review_deprecated_actors: "actors:read",
};

export const MCP_PROMPT_ADDITIONAL_CAPABILITIES: Partial<
  Record<(typeof MCP_PROMPT_NAMES)[number], readonly McpCapability[]>
> = {
  prepare_publishing_schedule: ["actors:read"],
};
