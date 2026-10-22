// Endpoint expectations are deliberately independent of the MCP handlers.
const actor = "owner~actor";
const schedule = "schedule-1";
const key = "mcp-contract-key";
const actorIds = ["actor-1"];
const pricing = {
  model: "PAY_PER_EVENT",
  events: { result: { eventTitle: "Result", eventPriceUsd: 0.01 } },
};
const read = (path, args = {}, query = {}) => ({ path, args, query, method: "GET" });
const write = (path, method, args = {}, body, idempotency = false) => ({
  path,
  args,
  method,
  body,
  idempotency,
});
const scheduleAction = (action) =>
  write(
    `/bulk-publishing/schedules/${schedule}/${action}`,
    "POST",
    { scheduleId: schedule, idempotencyKey: key },
    undefined,
    true,
  );

export const toolCases = {
  get_workspace: read("/mcp/workspace"),
  get_mcp_capabilities: read("/mcp/info"),
  get_mcp_usage: read("/mcp/usage", { days: 7 }, { days: "7" }),
  list_actors: read(
    "/actors",
    { search: "maps", page: 2, readiness: "missing-tagged-build" },
    { q: "maps", page: "2", format: "page", readiness: "missing-tagged-build" },
  ),
  get_actor: read(`/actors/${actor}`, { apifyActorId: actor }),
  list_published_actors: read("/actors", {}, { status: "published", format: "page" }),
  list_maintenance_actors: read("/actors", {}, { status: "maintenance" }),
  list_deprecated_actors: read("/actors", {}, { status: "deprecated" }),
  list_unpublished_actors: read("/actors", {}, { status: "unpublished" }),
  list_publish_ready_actors: read("/actors", {}, { status: "publish-ready" }),
  sync_actors: write("/actors/sync", "POST"),
  list_notifications: read(
    "/notifications",
    { unreadOnly: true, source: "apify", type: "ACTOR" },
    { unread: "true", source: "apify", type: "ACTOR" },
  ),
  get_unread_notification_count: read("/notifications", {}, { unread: "true", limit: "1" }),
  mark_notification_read: write("/notifications/notification-1/read", "POST", {
    notificationId: "notification-1",
  }),
  mark_all_notifications_read: write("/notifications/read-all", "POST"),
  analyze_actor: write(
    "/actors/optimization/runs",
    "POST",
    { apifyActorId: actor },
    {
      actorIds: [actor],
      kind: "GENERATE_IMPROVEMENTS",
      fields: ["title", "description", "pricing"],
    },
  ),
  rewrite_actor_title_description: write(
    "/actors/optimization/runs",
    "POST",
    { apifyActorId: actor },
    { actorIds: [actor], kind: "REWRITE_COPY", fields: ["title", "description"] },
  ),
  rewrite_actor_listing: write(
    "/actors/optimization/runs",
    "POST",
    { apifyActorId: actor },
    { actorIds: [actor], kind: "GENERATE_IMPROVEMENTS", fields: ["title", "description"] },
  ),
  create_actor_optimization_run: write(
    "/actors/optimization/runs",
    "POST",
    { actorIds, fields: ["title"] },
    { actorIds, fields: ["title"], kind: "CUSTOM" },
  ),
  get_actor_optimization_run: read("/actors/optimization/runs/run-1", { runId: "run-1" }),
  apply_actor_changes: write(
    "/actors/optimization/runs/run-1/approve",
    "POST",
    { runId: "run-1", items: [{ resultId: "result-1", fields: ["title"] }], idempotencyKey: key },
    { items: [{ resultId: "result-1", fields: ["title"] }] },
    true,
  ),
  get_actor_change_status: read("/actors/optimization/runs/run-1", { runId: "run-1" }),
  get_pricing: read(`/actors/${actor}/pricing`, { apifyActorId: actor }),
  set_pricing: write(
    `/actors/${actor}/pricing`,
    "PUT",
    { apifyActorId: actor, pricing, reason: "Approved" },
    { pricing: { ...pricing, amount: null, currency: "USD" }, reason: "Approved" },
  ),
  recommend_pricing: read(`/actors/${actor}/pricing/recommendation`, { apifyActorId: actor }),
  get_pricing_history: read(
    `/actors/${actor}/pricing/history`,
    { apifyActorId: actor },
    { limit: "60" },
  ),
  search_actors: read("/keywords/search", { query: "maps" }, { q: "maps", limit: "20" }),
  keyword_competitors: read("/keywords/search", { keyword: "maps" }, { q: "maps", limit: "20" }),
  get_usage_costs: read(
    `/actors/${actor}/usage`,
    { apifyActorId: actor, days: 7, granularity: "month", mode: "cumulative" },
    { days: "7", granularity: "month", mode: "cumulative" },
  ),
  get_actor_performance: read(`/actors/${actor}/usage`, { apifyActorId: actor }, { days: "60" }),
  get_actor_revenue: read(
    "/actors/revenue",
    { apifyActorId: actor, limit: 7, granularity: "month", mode: "cumulative" },
    { apifyActorId: actor, granularity: "month", mode: "cumulative" },
  ),
  get_workspace_usage: read("/actors/usage", {}, { granularity: "day", mode: "absolute" }),
  get_workspace_revenue: read("/actors/revenue", {}, { granularity: "day", mode: "absolute" }),
  get_usage_history: read("/actors/usage-costs", {}, { granularity: "day", mode: "absolute" }),
  change_actor_store_status: write(
    "/bulk-publishing/actors/status",
    "PATCH",
    { actorIds, action: "mark_maintenance", idempotencyKey: key },
    { actorIds, underMaintenance: true },
    true,
  ),
  list_actor_status_operations: read(
    "/bulk-publishing/status-operations",
    {},
    { page: "1", limit: "20" },
  ),
  get_actor_status_operation: read("/bulk-publishing/status-operations/operation-1", {
    operationId: "operation-1",
  }),
  list_publishing_schedules: read("/bulk-publishing/schedules"),
  get_publishing_schedule: read(`/bulk-publishing/schedules/${schedule}`, { scheduleId: schedule }),
  create_publishing_schedule: write(
    "/bulk-publishing/schedules",
    "POST",
    { name: "Publish", actorIds, idempotencyKey: key },
    { name: "Publish", actorIds, cronExpr: "0 2 * * *", dailyLimit: 5, enabled: false },
    true,
  ),
  update_publishing_schedule: write(
    `/bulk-publishing/schedules/${schedule}`,
    "PATCH",
    { scheduleId: schedule, name: "Updated", idempotencyKey: key },
    { name: "Updated" },
    true,
  ),
  add_actors_to_publishing_schedule: write(
    `/bulk-publishing/schedules/${schedule}/actors/add`,
    "POST",
    { scheduleId: schedule, actorIds, idempotencyKey: key },
    { actorIds },
    true,
  ),
  remove_actors_from_publishing_schedule: write(
    `/bulk-publishing/schedules/${schedule}/actors/remove`,
    "POST",
    { scheduleId: schedule, actorIds, idempotencyKey: key },
    { actorIds },
    true,
  ),
  pause_publishing_schedule: scheduleAction("pause"),
  resume_publishing_schedule: scheduleAction("resume"),
  run_publishing_schedule: scheduleAction("run"),
  list_publishing_runs: read(`/bulk-publishing/schedules/${schedule}/runs`, {
    scheduleId: schedule,
  }),
  get_publishing_run: read(`/bulk-publishing/schedules/${schedule}/runs/run-1`, {
    scheduleId: schedule,
    runId: "run-1",
  }),
  requeue_publishing_actor: write(
    `/bulk-publishing/schedules/${schedule}/actors/actor-1/retry`,
    "POST",
    { scheduleId: schedule, actorId: "actor-1", idempotencyKey: key },
    undefined,
    true,
  ),
};

export function apiFixture(path) {
  if (path === "/mcp/info")
    return {
      name: "actorconsole-mcp",
      version: "0.2.0",
      transport: "test",
      actorScope: "all",
      permissions: ["actors:read", "pricing:read", "usage:read"],
      tools: Object.keys(toolCases),
      resources: [],
      prompts: [],
    };
  if (path === "/actors/revenue")
    return {
      filters: {},
      report: { points: [{ revenueUsd: 7 }] },
      revenue: {
        actors: [{ apifyActorId: actor, revenueUsd: 7 }],
        daily: [],
        coverage: {},
        syncedAt: null,
        ledgerTruncated: false,
      },
    };
  if (path === "/actors") return [];
  if (path === "/keywords/search") return [{ id: "public-actor" }];
  if (path === "/notifications") return { items: [], unread: 3, sources: {} };
  return { id: "fixture", runId: "run-1", queued: 1, ok: true };
}
