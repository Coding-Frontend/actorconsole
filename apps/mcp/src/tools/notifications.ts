import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actorConsoleApi } from "../lib/actorconsole-api.js";
import { errorResult, jsonResult } from "../lib/respond.js";

interface NotificationList {
  items: unknown[];
  total: number;
  unread: number;
  page: number;
  limit: number;
  sources: unknown;
}

export function registerNotificationTools(server: McpServer) {
  server.tool(
    "list_notifications",
    "List ActorConsole and Apify notifications for this workspace with optional filters.",
    {
      unreadOnly: z.boolean().optional().default(false),
      source: z.enum(["all", "actorconsole", "apify"]).optional().default("all"),
      type: z.string().max(120).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      page: z.number().int().min(1).max(100).optional().default(1),
      limit: z.number().int().min(1).max(100).optional().default(50),
    },
    async ({ unreadOnly, source, type, from, to, page, limit }) => {
      try {
        const query = new URLSearchParams({
          unread: String(unreadOnly),
          source,
          page: String(page),
          limit: String(limit),
        });
        if (type) query.set("type", type);
        if (from) query.set("from", from);
        if (to) query.set("to", to);
        return jsonResult(await actorConsoleApi<NotificationList>(`/notifications?${query}`));
      } catch (error) {
        return errorResult("Failed to list notifications", String(error));
      }
    },
  );

  server.tool(
    "get_unread_notification_count",
    "Return the unread notification count for this workspace.",
    {},
    async () => {
      try {
        const result = await actorConsoleApi<NotificationList>(
          "/notifications?unread=true&page=1&limit=1",
        );
        return jsonResult({ unread: result.unread, sources: result.sources });
      } catch (error) {
        return errorResult("Failed to get unread notification count", String(error));
      }
    },
  );

  server.tool(
    "mark_notification_read",
    "Mark one ActorConsole or Apify notification as read.",
    { notificationId: z.string().min(1).max(250) },
    async ({ notificationId }) => {
      try {
        return jsonResult(
          await actorConsoleApi(`/notifications/${encodeURIComponent(notificationId)}/read`, {
            method: "POST",
          }),
        );
      } catch (error) {
        return errorResult("Failed to mark notification read", String(error));
      }
    },
  );

  server.tool(
    "mark_all_notifications_read",
    "Mark all ActorConsole and available Apify notifications as read.",
    {},
    async () => {
      try {
        return jsonResult(await actorConsoleApi("/notifications/read-all", { method: "POST" }));
      } catch (error) {
        return errorResult("Failed to mark all notifications read", String(error));
      }
    },
  );
}
