"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CalendarClock,
  CheckCircle2,
  History,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-base";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkPublishingHeader } from "@/components/dashboard/bulk-publishing-header";
import { BulkStatusOperations } from "@/components/dashboard/bulk-status-operations";
import { DashboardAsyncState } from "@/components/dashboard/dashboard-workbench";
import {
  isBulkScheduleActorEligible,
  type BulkSchedule,
} from "@/components/dashboard/bulk-publishing-types";

function formatDate(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not yet" : date.toLocaleString("en-IN");
}

function formatRunStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

export function BulkPublishingSchedules({
  initialView = "schedules",
  initialOperationId,
}: {
  initialView?: "schedules" | "status-changes";
  initialOperationId?: string;
}) {
  const [schedules, setSchedules] = useState<BulkSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retryingActorId, setRetryingActorId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BulkSchedule | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [scheduleDetails, setScheduleDetails] = useState<Record<string, BulkSchedule>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [activeRun, setActiveRun] = useState<{
    scheduleId: string;
    jobId: string;
    completed: number;
    total: number;
    published: number;
    failed: number;
  } | null>(null);
  const schedulesRef = useRef<BulkSchedule[]>([]);
  const requestId = useRef(0);

  const load = useCallback(async (quiet = false) => {
    const currentRequest = ++requestId.current;
    const hasCachedSchedules = schedulesRef.current.length > 0;
    if (quiet || hasCachedSchedules) setRefreshing(true);
    if (!quiet) setLoading(!hasCachedSchedules);
    setLoadError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/bulk-publishing/schedules`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? "Could not load publishing schedules");
      }
      if (currentRequest !== requestId.current) return;
      const nextSchedules = (body.data ?? []) as BulkSchedule[];
      schedulesRef.current = nextSchedules;
      setSchedules(nextSchedules);
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      const message = error instanceof Error ? error.message : "Could not load schedules";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (initialView === "schedules") void load();
  }, [initialView, load]);
  useEffect(() => {
    if (initialView !== "schedules") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [initialView, load]);

  useEffect(() => {
    const jobId = activeRun?.jobId;
    if (!jobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/bulk-publishing/operations/${jobId}`, {
          credentials: "include",
          cache: "no-store",
        });
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.ok) {
          throw new Error(body?.error?.message ?? "Could not read publishing progress");
        }
        if (cancelled) return;
        const state = String(body.data.state ?? "").toUpperCase();
        const progress = body.data.progress ?? {};
        setActiveRun((current) =>
          current
            ? {
                ...current,
                completed: Number(progress.completed) || 0,
                total: Number(progress.total) || current.total,
                published: Number(progress.published) || 0,
                failed: Number(progress.failed) || 0,
              }
            : null,
        );
        if (["COMPLETED", "SUCCEEDED", "FAILED"].includes(state)) {
          setActiveRun(null);
          await load(true);
          if (state === "FAILED") toast.error(body.data.error ?? "Publishing run failed");
          else toast.success("Publishing run finished. Open Run history for details.");
        }
      } catch (error) {
        if (!cancelled) {
          setActiveRun(null);
          toast.error(
            error instanceof Error ? error.message : "Could not read publishing progress",
          );
        }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeRun?.jobId, load]);

  const summary = useMemo(() => {
    const active = schedules.filter((schedule) => schedule.enabled).length;
    const blocked = schedules.filter(
      (schedule) =>
        schedule.quotaBlockedUntil && new Date(schedule.quotaBlockedUntil).getTime() > Date.now(),
    ).length;
    const remaining = schedules.reduce(
      (total, schedule) =>
        total + schedule.actors.filter((actor) => isBulkScheduleActorEligible(actor.status)).length,
      0,
    );
    return { active, blocked, remaining };
  }, [schedules]);

  async function toggleSchedule(scheduleId: string) {
    const willOpen = !expanded.has(scheduleId);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(scheduleId)) next.delete(scheduleId);
      else next.add(scheduleId);
      return next;
    });
    if (!willOpen || scheduleDetails[scheduleId]) return;
    setLoadingDetailId(scheduleId);
    try {
      const response = await fetch(`${API_BASE_URL}/bulk-publishing/schedules/${scheduleId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? "Could not load schedule details");
      }
      setScheduleDetails((current) => ({ ...current, [scheduleId]: body.data as BulkSchedule }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load schedule details");
    } finally {
      setLoadingDetailId((current) => (current === scheduleId ? null : current));
    }
  }

  async function scheduleAction(schedule: BulkSchedule, action: "run" | "toggle" | "delete") {
    setBusyId(schedule.id);
    try {
      const response = await fetch(
        `${API_BASE_URL}/bulk-publishing/schedules/${schedule.id}${action === "run" ? "/run" : ""}`,
        {
          method: action === "run" ? "POST" : action === "delete" ? "DELETE" : "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          ...(action === "toggle" ? { body: JSON.stringify({ enabled: !schedule.enabled }) } : {}),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? "Schedule action failed");
      }
      toast.success(
        action === "run"
          ? "Publishing run started"
          : action === "delete"
            ? "Schedule deleted"
            : schedule.enabled
              ? "Schedule paused"
              : "Schedule enabled",
      );
      if (action === "run" && body.data?.jobId) {
        setActiveRun({
          scheduleId: schedule.id,
          jobId: body.data.jobId,
          completed: 0,
          total: Math.min(
            schedule.dailyLimit,
            schedule.actors.filter((actor) => isBulkScheduleActorEligible(actor.status)).length,
          ),
          published: 0,
          failed: 0,
        });
      }
      setDeleteTarget(null);
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Schedule action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function retryBlockedActor(scheduleId: string, actorId: string) {
    setRetryingActorId(actorId);
    try {
      const response = await fetch(
        `${API_BASE_URL}/bulk-publishing/schedules/${scheduleId}/actors/${actorId}/retry`,
        { method: "POST", credentials: "include" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? "Could not requeue this Actor");
      }
      toast.success("Actor returned to the publishing queue");
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not requeue this Actor");
    } finally {
      setRetryingActorId(null);
    }
  }

  return (
    <div className="space-y-6">
      <BulkPublishingHeader active="schedules" />

      <nav
        className="border-border bg-card flex flex-wrap items-center gap-1 rounded-sm border p-1"
        aria-label="Schedule history views"
      >
        <Button size="sm" variant={initialView === "schedules" ? "secondary" : "ghost"} asChild>
          <Link href="/dashboard/publishing/schedules">Publishing schedules</Link>
        </Button>
        <Button
          size="sm"
          variant={initialView === "status-changes" ? "secondary" : "ghost"}
          asChild
        >
          <Link href="/dashboard/publishing/schedules?view=status-changes">Status changes</Link>
        </Button>
      </nav>

      {initialView === "status-changes" ? (
        <BulkStatusOperations initialOperationId={initialOperationId} />
      ) : (
        <>
          <section className="bg-border grid gap-px overflow-hidden rounded-md border sm:grid-cols-3">
            {[
              { label: "Active schedules", value: summary.active, icon: CalendarClock },
              { label: "Actors remaining", value: summary.remaining, icon: Activity },
              { label: "Quota holds", value: summary.blocked, icon: ShieldAlert },
            ].map((item) => (
              <div key={item.label} className="bg-card flex items-center justify-between p-5">
                <div>
                  <p className="data-stamp text-muted-foreground uppercase">{item.label}</p>
                  <p className="font-display-tight mt-2 text-3xl">{item.value}</p>
                </div>
                <item.icon className="text-signal-orange h-5 w-5" />
              </div>
            ))}
          </section>

          <section className="border-border bg-card overflow-hidden rounded-md border shadow-sm">
            <div className="border-border flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display-tight text-xl">Publishing schedules</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Daily queues, recent outcomes, and Apify quota state.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void load(true)} disabled={refreshing}>
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
                </Button>
                <Button asChild>
                  <Link href="/dashboard/publishing/schedules/new">
                    <Plus className="h-4 w-4" /> New schedule
                  </Link>
                </Button>
              </div>
            </div>

            {refreshing ? (
              <DashboardAsyncState
                status="refreshing"
                title="Refreshing publishing schedules"
                description="Showing cached queue state while the latest run history is fetched."
                className="m-4 sm:m-5"
              />
            ) : null}
            {!loading && loadError && schedules.length > 0 ? (
              <DashboardAsyncState
                status="warning"
                title="Showing cached schedule data"
                description={loadError}
                onRetry={() => void load(true)}
                className="m-4 sm:m-5"
              />
            ) : null}
            {loading ? (
              <div className="bg-border space-y-px">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-44 w-full rounded-none" />
                ))}
              </div>
            ) : schedules.length === 0 && loadError ? (
              <DashboardAsyncState
                status="error"
                title="Could not load publishing schedules"
                description={loadError}
                onRetry={() => void load()}
                className="m-4 sm:m-5"
              />
            ) : schedules.length === 0 ? (
              <div className="px-6 py-20 text-center">
                <CalendarClock className="text-muted-foreground mx-auto h-7 w-7" />
                <p className="mt-4 font-medium">No publishing schedules</p>
                <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
                  Create a daily queue and select its Actors directly in the schedule builder.
                </p>
                <Button className="mt-5" asChild>
                  <Link href="/dashboard/publishing/schedules/new">Create schedule</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-border divide-y">
                {schedules.map((schedule) => {
                  const published = schedule.actors.filter(
                    (actor) => actor.status === "PUBLISHED",
                  ).length;
                  const blockedActors = schedule.actors.filter(
                    (actor) => actor.status === "BLOCKED" || actor.status === "FAILED",
                  );
                  const failed = blockedActors.length;
                  const quotaBlocked = schedule.quotaBlockedUntil
                    ? new Date(schedule.quotaBlockedUntil).getTime() > Date.now()
                    : false;
                  const completion = schedule.actors.length
                    ? Math.round((published / schedule.actors.length) * 100)
                    : 0;
                  const isExpanded = expanded.has(schedule.id);
                  const detailSchedule = scheduleDetails[schedule.id] ?? schedule;
                  const liveRun = activeRun?.scheduleId === schedule.id ? activeRun : null;
                  return (
                    <article
                      key={schedule.id}
                      className="border-border/70 group border-b last:border-b-0"
                    >
                      <div className="space-y-4 p-4 sm:p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-display-tight truncate text-xl">
                                {schedule.name}
                              </h3>
                              <Badge
                                variant="outline"
                                className={
                                  schedule.enabled
                                    ? "border-signal-green/35 bg-signal-green/[0.06] text-signal-green"
                                    : "text-muted-foreground"
                                }
                              >
                                {schedule.enabled ? "Active" : "Paused"}
                              </Badge>
                              {quotaBlocked ? (
                                <Badge
                                  variant="outline"
                                  className="border-signal-orange/35 bg-signal-orange/[0.06] text-signal-orange"
                                >
                                  Daily limit reached
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-muted-foreground mt-1.5 text-xs">
                              Next run {formatDate(schedule.nextRunAt)} · Up to{" "}
                              {schedule.dailyLimit} Actors daily
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void scheduleAction(schedule, "run")}
                              disabled={busyId === schedule.id || quotaBlocked || Boolean(liveRun)}
                            >
                              {busyId === schedule.id || liveRun ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Play className="h-3.5 w-3.5" />
                              )}{" "}
                              {liveRun ? "Running" : "Run now"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void scheduleAction(schedule, "toggle")}
                              disabled={busyId === schedule.id}
                            >
                              {schedule.enabled ? (
                                <Pause className="h-3.5 w-3.5" />
                              ) : (
                                <Play className="h-3.5 w-3.5" />
                              )}
                              {schedule.enabled ? "Pause" : "Enable"}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive h-9 w-9"
                              onClick={() => setDeleteTarget(schedule)}
                              aria-label={`Delete ${schedule.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {liveRun ? (
                          <div className="border-signal-blue/25 bg-signal-blue/[0.055] rounded-sm border px-4 py-3">
                            <div className="flex items-center justify-between gap-4 text-xs">
                              <span className="text-signal-blue flex items-center gap-2 font-semibold">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Publishing Actors
                              </span>
                              <span className="font-mono">
                                {liveRun.completed} / {liveRun.total}
                              </span>
                            </div>
                            <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                              <div
                                className="bg-signal-blue h-full rounded-full transition-[width] duration-300"
                                style={{
                                  width: `${liveRun.total ? Math.round((liveRun.completed / liveRun.total) * 100) : 5}%`,
                                }}
                              />
                            </div>
                            <p className="text-muted-foreground mt-2 text-xs">
                              {liveRun.published} published · {liveRun.failed} failed. Keep this
                              page open to follow the current run.
                            </p>
                          </div>
                        ) : null}

                        {blockedActors.length ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-signal-orange/40 text-signal-orange"
                            onClick={() => void toggleSchedule(schedule.id)}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {blockedActors.length} Actor{blockedActors.length === 1 ? "" : "s"} need
                            attention · View details
                          </Button>
                        ) : null}

                        <div>
                          <div className="mb-2 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {published} of {schedule.actors.length} published
                              {failed ? ` · ${failed} need attention` : ""}
                            </span>
                            <span className="font-mono font-semibold">{completion}%</span>
                          </div>
                          <div className="bg-muted h-2 overflow-hidden rounded-full">
                            <div
                              className="bg-signal-green h-full rounded-full transition-[width] duration-500"
                              style={{ width: `${completion}%` }}
                            />
                          </div>
                        </div>

                        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                          <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Last run{" "}
                            {formatDate(schedule.lastRunAt)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-1"
                            onClick={() => void toggleSchedule(schedule.id)}
                          >
                            <History className="h-3.5 w-3.5" /> View details and run history
                          </Button>
                        </div>
                      </div>

                      <Dialog
                        open={isExpanded}
                        onOpenChange={(open) => {
                          if (!open) void toggleSchedule(schedule.id);
                        }}
                      >
                        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                          <DialogHeader>
                            <DialogTitle>{schedule.name}</DialogTitle>
                            <DialogDescription>
                              {schedule.cronExpr} UTC · Up to {schedule.dailyLimit} Actors daily ·
                              Next run {formatDate(schedule.nextRunAt)}
                            </DialogDescription>
                          </DialogHeader>
                          {blockedActors.length ? (
                            <section
                              className="border-signal-orange/30 bg-signal-orange/[0.045] rounded-md border"
                              aria-label="Actors needing attention"
                            >
                              <div className="border-signal-orange/20 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                                <p className="flex items-center gap-2 text-sm font-semibold">
                                  <AlertTriangle className="text-signal-orange h-4 w-4" />
                                  {blockedActors.length} Actor
                                  {blockedActors.length === 1 ? "" : "s"} need attention
                                </p>
                                <Button size="sm" variant="outline" asChild>
                                  <Link href="/dashboard/actors?readiness=needs-attention">
                                    Open readiness list
                                  </Link>
                                </Button>
                              </div>
                              <div className="divide-signal-orange/15 divide-y">
                                {blockedActors.slice(0, 5).map((item) => (
                                  <div
                                    key={item.actorId}
                                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium">
                                        {item.actor.title ?? item.actor.actorName}
                                      </p>
                                      <p className="text-muted-foreground mt-0.5 text-xs">
                                        {item.lastError ??
                                          "Fix the Actor readiness issue, then retry."}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Button size="sm" variant="outline" asChild>
                                        <Link
                                          href={`/dashboard/actors/${item.actor.id ?? item.actorId}`}
                                        >
                                          Fix Actor
                                        </Link>
                                      </Button>
                                      <Button size="sm" variant="ghost" asChild>
                                        <Link
                                          href={`/dashboard/support/new?from=publishing&actorId=${encodeURIComponent(item.actor.id ?? item.actorId)}`}
                                        >
                                          Ask support
                                        </Link>
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={retryingActorId === item.actorId}
                                        onClick={() =>
                                          void retryBlockedActor(schedule.id, item.actorId)
                                        }
                                      >
                                        {retryingActorId === item.actorId ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : null}
                                        Retry
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          ) : null}
                          <p className="text-sm font-medium">Run history</p>
                          {loadingDetailId === schedule.id ? (
                            <p className="text-muted-foreground text-sm">Loading run details…</p>
                          ) : detailSchedule.runs.length ? (
                            <div className="space-y-2">
                              {detailSchedule.runs.map((run) => {
                                const runExpanded = expandedRuns.has(run.id);
                                const actorNames = new Map(
                                  detailSchedule.actors.map((item) => [
                                    item.actorId,
                                    item.actor.title ?? item.actor.actorName,
                                  ]),
                                );
                                return (
                                  <div
                                    key={run.id}
                                    className="border-border bg-card rounded-sm border"
                                  >
                                    <button
                                      type="button"
                                      className="grid w-full gap-2 px-3 py-3 text-left text-xs sm:grid-cols-[160px_110px_1fr_auto] sm:items-center"
                                      onClick={() =>
                                        setExpandedRuns((current) => {
                                          const next = new Set(current);
                                          if (next.has(run.id)) next.delete(run.id);
                                          else next.add(run.id);
                                          return next;
                                        })
                                      }
                                    >
                                      <span className="text-muted-foreground">
                                        {formatDate(run.startedAt ?? run.createdAt)}
                                      </span>
                                      <span
                                        className={`flex items-center gap-1.5 font-medium ${run.status === "SUCCEEDED" ? "text-signal-green" : run.status === "FAILED" ? "text-destructive" : "text-signal-orange"}`}
                                      >
                                        {run.status === "SUCCEEDED" ? (
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                        ) : (
                                          <AlertTriangle className="h-3.5 w-3.5" />
                                        )}
                                        {formatRunStatus(run.status)}
                                      </span>
                                      <span className="text-muted-foreground">
                                        {run.publishedCount} published from {run.attemptedCount}{" "}
                                        attempted
                                      </span>
                                      <span className="flex items-center gap-1 font-medium">
                                        View calls
                                        {runExpanded ? (
                                          <ChevronUp className="h-3.5 w-3.5" />
                                        ) : (
                                          <ChevronDown className="h-3.5 w-3.5" />
                                        )}
                                      </span>
                                    </button>
                                    {runExpanded ? (
                                      <div className="border-border bg-muted/15 divide-border divide-y border-t">
                                        {run.result?.length ? (
                                          run.result.map((result, index) => (
                                            <div
                                              key={`${run.id}-${result.actorId}-${index}`}
                                              className="px-4 py-3"
                                            >
                                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                <p className="text-sm font-medium">
                                                  {actorNames.get(result.actorId) ??
                                                    `Publishing call ${index + 1}`}
                                                </p>
                                                <Badge
                                                  variant="outline"
                                                  className={
                                                    result.status === "PUBLISHED" ||
                                                    result.status === "ALREADY_PUBLISHED"
                                                      ? "border-signal-green/35 text-signal-green"
                                                      : result.status === "FAILED" ||
                                                          result.status === "BLOCKED"
                                                        ? "border-destructive/35 text-destructive"
                                                        : "border-signal-orange/35 text-signal-orange"
                                                  }
                                                >
                                                  {formatRunStatus(result.status)}
                                                </Badge>
                                              </div>
                                              {result.error ? (
                                                <p className="text-muted-foreground mt-2 break-words text-xs leading-relaxed">
                                                  {result.error}
                                                </p>
                                              ) : null}
                                            </div>
                                          ))
                                        ) : (
                                          <p className="text-muted-foreground px-4 py-4 text-xs">
                                            Per-Actor details were not recorded for this older run.
                                          </p>
                                        )}
                                        {run.stoppedReason ? (
                                          <p className="text-signal-orange px-4 py-3 text-xs font-medium">
                                            Run stopped: {formatRunStatus(run.stoppedReason)}
                                          </p>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-muted-foreground text-sm">
                              This schedule has not run yet.
                            </p>
                          )}
                        </DialogContent>
                      </Dialog>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete publishing schedule?"
        description={`Delete ${deleteTarget?.name ?? "this schedule"} and its run history? Actor Store state will not be changed.`}
        confirmLabel="Delete schedule"
        destructive
        onConfirm={() => (deleteTarget ? scheduleAction(deleteTarget, "delete") : undefined)}
      />
    </div>
  );
}
