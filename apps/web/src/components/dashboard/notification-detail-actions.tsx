"use client";

import { CheckCircle2, Loader2, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-base";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "@/components/dashboard/dashboard-navigation";
import { Button } from "@/components/ui/button";

type NotificationAction = {
  id: "clear-maintenance" | "clear-deprecated" | "open-ticket";
  label: string;
  description: string;
};

type OperationDetail = {
  status?: string;
  state?: string;
  error?: string | null;
  items?: Array<{ status?: string; error?: string | null }>;
};

const FINISHED = new Set(["SUCCEEDED", "FAILED", "PARTIAL"]);

async function waitForOperation(input: {
  operationId?: string | null;
  jobId?: string | null;
}): Promise<OperationDetail> {
  const durable = Boolean(input.operationId);
  const id = input.operationId ?? input.jobId;
  if (!id) throw new Error("The Actor update did not return an operation identifier");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(
      `${API_BASE_URL}/bulk-publishing/${durable ? "status-operations" : "operations"}/${encodeURIComponent(id)}`,
      { credentials: "include", cache: "no-store" },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error?.message ?? "Could not check the Actor update");
    }
    if (
      FINISHED.has(body.data.status) ||
      ["completed", "failed"].includes(String(body.data.state ?? "").toLowerCase())
    ) {
      return body.data;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
  }
  return { status: "RUNNING" };
}

export function NotificationDetailActions({
  notificationId,
  unread,
  actorId,
  actions,
}: {
  notificationId: string;
  unread: boolean;
  actorId: string | null;
  actions: NotificationAction[];
}) {
  const [running, setRunning] = useState<NotificationAction["id"] | null>(null);
  const [completed, setCompleted] = useState<Set<NotificationAction["id"]>>(new Set());

  useEffect(() => {
    if (!unread) return;
    void fetch(`${API_BASE_URL}/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: "POST",
      credentials: "include",
    }).finally(() => window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT)));
  }, [notificationId, unread]);

  async function run(action: NotificationAction) {
    if (!actorId || action.id === "open-ticket") return;
    setRunning(action.id);
    try {
      const response = await fetch(`${API_BASE_URL}/bulk-publishing/actors/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          actorIds: [actorId],
          ...(action.id === "clear-maintenance"
            ? { underMaintenance: false }
            : { isDeprecated: false }),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? `Could not ${action.label.toLowerCase()}`);
      }
      const operation = await waitForOperation({
        operationId: body.data.operationId,
        jobId: body.data.jobId,
      });
      if (
        operation.status === "FAILED" ||
        operation.status === "PARTIAL" ||
        operation.state?.toLowerCase() === "failed"
      ) {
        const itemError = operation.items?.find((item) => item.error)?.error;
        throw new Error(itemError ?? operation.error ?? "Apify did not accept the status update");
      }
      if (operation.status === "RUNNING") {
        toast.info("The update is still running. You can follow it from Publishing schedules.");
      } else {
        setCompleted((current) => new Set(current).add(action.id));
        toast.success(`${action.label} completed`);
      }
      window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the Actor");
    } finally {
      setRunning(null);
    }
  }

  const actorActions = actions.filter((action) => action.id !== "open-ticket");
  if (!actorActions.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actorActions.map((action) => {
        const isRunning = running === action.id;
        const isComplete = completed.has(action.id);
        return (
          <Button
            key={action.id}
            type="button"
            onClick={() => void run(action)}
            disabled={!actorId || Boolean(running) || isComplete}
          >
            {isRunning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : isComplete ? (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            ) : (
              <Wrench className="mr-2 h-4 w-4" />
            )}
            {isComplete ? "Completed" : action.label}
          </Button>
        );
      })}
    </div>
  );
}
