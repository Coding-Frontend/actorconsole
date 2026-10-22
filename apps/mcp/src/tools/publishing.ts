import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actorConsoleApi } from "../lib/actorconsole-api.js";
import { errorResult, jsonResult } from "../lib/respond.js";

const scheduleFields = {
  name: z.string().trim().min(1).max(100),
  actorIds: z
    .array(z.string().min(1))
    .min(1)
    .max(10_000)
    .describe("ActorConsole internal Actor IDs from list_actors items[].id"),
  cronExpr: z.string().trim().min(9).max(100).default("0 2 * * *"),
  dailyLimit: z.number().int().min(1).max(100).default(5),
  enabled: z.boolean().default(false),
};

async function publishingApi(path: string, init?: RequestInit) {
  return actorConsoleApi(`/bulk-publishing${path}`, init);
}

export function registerPublishingTools(server: McpServer) {
  server.tool(
    "change_actor_store_status",
    "Apply an immediate Store lifecycle change to selected workspace Actors and persist its Actor-level results.",
    {
      actorIds: scheduleFields.actorIds,
      action: z.enum([
        "clear_maintenance",
        "mark_maintenance",
        "clear_deprecated",
        "mark_deprecated",
      ]),
      idempotencyKey: z.string().min(8).max(191),
    },
    async ({ actorIds, action, idempotencyKey }) => {
      const change =
        action === "clear_maintenance"
          ? { underMaintenance: false, isDeprecated: false }
          : action === "mark_maintenance"
            ? { underMaintenance: true }
            : action === "clear_deprecated"
              ? { isDeprecated: false }
              : { isDeprecated: true };
      try {
        return jsonResult(
          await publishingApi("/actors/status", {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              "idempotency-key": idempotencyKey,
            },
            body: JSON.stringify({ actorIds, ...change }),
          }),
        );
      } catch (error) {
        return errorResult("Failed to change Actor Store status", String(error));
      }
    },
  );

  server.tool(
    "list_actor_status_operations",
    "List durable immediate Store lifecycle operations for the active workspace.",
    {
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ page, limit }) => {
      try {
        return jsonResult(await publishingApi(`/status-operations?page=${page}&limit=${limit}`));
      } catch (error) {
        return errorResult("Failed to list Actor status operations", String(error));
      }
    },
  );

  server.tool(
    "get_actor_status_operation",
    "Get one immediate Store lifecycle operation and its per-Actor calls.",
    { operationId: z.string().min(1) },
    async ({ operationId }) => {
      try {
        return jsonResult(
          await publishingApi(`/status-operations/${encodeURIComponent(operationId)}`),
        );
      } catch (error) {
        return errorResult("Failed to get Actor status operation", String(error));
      }
    },
  );

  server.tool(
    "list_publishing_schedules",
    "List workspace publishing schedules and recent runs.",
    {},
    async () => {
      try {
        return jsonResult(await publishingApi("/schedules"));
      } catch (error) {
        return errorResult("Failed to list publishing schedules", String(error));
      }
    },
  );

  server.tool(
    "get_publishing_schedule",
    "Get one publishing schedule, its ordered Actors, and recent runs.",
    { scheduleId: z.string().min(1) },
    async ({ scheduleId }) => {
      try {
        return jsonResult(await publishingApi(`/schedules/${encodeURIComponent(scheduleId)}`));
      } catch (error) {
        return errorResult("Failed to get publishing schedule", String(error));
      }
    },
  );

  server.tool(
    "create_publishing_schedule",
    "Create an ordered, quota-aware publishing schedule. New schedules are paused unless enabled is explicitly true.",
    { ...scheduleFields, idempotencyKey: z.string().min(8).max(191) },
    async (input) => {
      try {
        return jsonResult(
          await publishingApi("/schedules", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "idempotency-key": input.idempotencyKey,
            },
            body: JSON.stringify(input),
          }),
        );
      } catch (error) {
        return errorResult("Failed to create publishing schedule", String(error));
      }
    },
  );

  server.tool(
    "update_publishing_schedule",
    "Update a publishing schedule configuration or replace its ordered Actor queue.",
    {
      scheduleId: z.string().min(1),
      name: scheduleFields.name.optional(),
      actorIds: scheduleFields.actorIds.optional(),
      cronExpr: z.string().trim().min(9).max(100).optional(),
      dailyLimit: z.number().int().min(1).max(100).optional(),
      enabled: z.boolean().optional(),
      idempotencyKey: z.string().min(8).max(191),
    },
    async ({ scheduleId, idempotencyKey, ...changes }) => {
      try {
        return jsonResult(
          await publishingApi(`/schedules/${encodeURIComponent(scheduleId)}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              "idempotency-key": idempotencyKey,
            },
            body: JSON.stringify(changes),
          }),
        );
      } catch (error) {
        return errorResult("Failed to update publishing schedule", String(error));
      }
    },
  );

  for (const operation of ["add", "remove"] as const) {
    server.tool(
      `${operation}_actors_${operation === "add" ? "to" : "from"}_publishing_schedule`,
      `${operation === "add" ? "Add Actors to" : "Remove Actors from"} a publishing schedule queue.`,
      {
        scheduleId: z.string().min(1),
        actorIds: scheduleFields.actorIds,
        idempotencyKey: z.string().min(8).max(191),
      },
      async ({ scheduleId, actorIds, idempotencyKey }) => {
        try {
          return jsonResult(
            await publishingApi(
              `/schedules/${encodeURIComponent(scheduleId)}/actors/${operation}`,
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "idempotency-key": idempotencyKey,
                },
                body: JSON.stringify({ actorIds }),
              },
            ),
          );
        } catch (error) {
          return errorResult(`Failed to ${operation} publishing schedule Actors`, String(error));
        }
      },
    );
  }

  for (const operation of ["pause", "resume"] as const) {
    server.tool(
      `${operation}_publishing_schedule`,
      `${operation === "pause" ? "Pause" : "Resume"} a publishing schedule.`,
      { scheduleId: z.string().min(1), idempotencyKey: z.string().min(8).max(191) },
      async ({ scheduleId, idempotencyKey }) => {
        try {
          return jsonResult(
            await publishingApi(`/schedules/${encodeURIComponent(scheduleId)}/${operation}`, {
              method: "POST",
              headers: { "idempotency-key": idempotencyKey },
            }),
          );
        } catch (error) {
          return errorResult(`Failed to ${operation} publishing schedule`, String(error));
        }
      },
    );
  }

  server.tool(
    "run_publishing_schedule",
    "Queue an immediate run of a publishing schedule. The run stops when Apify reports its daily publication quota.",
    { scheduleId: z.string().min(1), idempotencyKey: z.string().min(8).max(191) },
    async ({ scheduleId, idempotencyKey }) => {
      try {
        return jsonResult(
          await publishingApi(`/schedules/${encodeURIComponent(scheduleId)}/run`, {
            method: "POST",
            headers: { "idempotency-key": idempotencyKey },
          }),
        );
      } catch (error) {
        return errorResult("Failed to run publishing schedule", String(error));
      }
    },
  );

  server.tool(
    "list_publishing_runs",
    "List the latest execution records for a publishing schedule.",
    { scheduleId: z.string().min(1) },
    async ({ scheduleId }) => {
      try {
        return jsonResult(await publishingApi(`/schedules/${encodeURIComponent(scheduleId)}/runs`));
      } catch (error) {
        return errorResult("Failed to list publishing runs", String(error));
      }
    },
  );

  server.tool(
    "get_publishing_run",
    "Get one publishing run with attempted/published counts, stop reason, and per-Actor result payload.",
    { scheduleId: z.string().min(1), runId: z.string().min(1) },
    async ({ scheduleId, runId }) => {
      try {
        return jsonResult(
          await publishingApi(
            `/schedules/${encodeURIComponent(scheduleId)}/runs/${encodeURIComponent(runId)}`,
          ),
        );
      } catch (error) {
        return errorResult("Failed to get publishing run", String(error));
      }
    },
  );

  server.tool(
    "requeue_publishing_actor",
    "Move a blocked or failed Actor back to pending in a publishing schedule.",
    {
      scheduleId: z.string().min(1),
      actorId: z
        .string()
        .min(1)
        .describe("ActorConsole internal Actor ID from a schedule's Actor queue"),
      idempotencyKey: z.string().min(8).max(191),
    },
    async ({ scheduleId, actorId, idempotencyKey }) => {
      try {
        return jsonResult(
          await publishingApi(
            `/schedules/${encodeURIComponent(scheduleId)}/actors/${encodeURIComponent(actorId)}/retry`,
            { method: "POST", headers: { "idempotency-key": idempotencyKey } },
          ),
        );
      } catch (error) {
        return errorResult("Failed to requeue publishing Actor", String(error));
      }
    },
  );
}
