"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  History,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-base";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  BulkStatusOperation,
  BulkStatusOperationDetail,
} from "@/components/dashboard/bulk-publishing-types";

const ACTIVE_STATUSES = new Set(["QUEUED", "RUNNING"]);

function formatDate(value: string | null) {
  if (!value) return "Not completed";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not completed" : date.toLocaleString("en-IN");
}

function actionLabel(action: string) {
  switch (action) {
    case "CLEAR_MAINTENANCE":
      return "Clear maintenance and deprecated status";
    case "MARK_MAINTENANCE":
      return "Mark under maintenance";
    case "CLEAR_DEPRECATED":
      return "Clear deprecated status";
    case "MARK_DEPRECATED":
      return "Mark deprecated";
    default:
      return action.toLowerCase().replaceAll("_", " ");
  }
}

function statusClasses(status: string) {
  if (status === "SUCCEEDED") {
    return "border-signal-green/35 bg-signal-green/[0.06] text-signal-green";
  }
  if (status === "FAILED") return "border-destructive/30 bg-destructive/[0.06] text-destructive";
  if (status === "PARTIAL") {
    return "border-signal-orange/35 bg-signal-orange/[0.06] text-signal-orange";
  }
  return "border-signal-blue/35 bg-signal-blue/[0.06] text-signal-blue";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "RUNNING") return <Loader2 className="h-4 w-4 animate-spin" />;
  if (status === "SUCCEEDED") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "FAILED") return <XCircle className="h-4 w-4" />;
  if (status === "PARTIAL") return <AlertTriangle className="h-4 w-4" />;
  return <Clock3 className="h-4 w-4" />;
}

export function BulkStatusOperations({ initialOperationId }: { initialOperationId?: string }) {
  const [operations, setOperations] = useState<BulkStatusOperation[]>([]);
  const [details, setDetails] = useState<Record<string, BulkStatusOperationDetail>>({});
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initialOperationId ? [initialOperationId] : []),
  );
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDetail = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoadingDetails((current) => new Set(current).add(id));
    try {
      const response = await fetch(`${API_BASE_URL}/bulk-publishing/status-operations/${id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? "Could not load status-operation calls");
      }
      setDetails((current) => ({ ...current, [id]: body.data }));
    } catch (error) {
      if (!quiet) {
        toast.error(error instanceof Error ? error.message : "Could not load operation calls");
      }
    } finally {
      if (!quiet) {
        setLoadingDetails((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    }
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      try {
        setLoadError(null);
        const response = await fetch(
          `${API_BASE_URL}/bulk-publishing/status-operations?page=${page}&limit=20`,
          { credentials: "include", cache: "no-store" },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.ok) {
          throw new Error(body?.error?.message ?? "Could not load status changes");
        }
        setOperations(body.data.items ?? []);
        setTotal(body.data.total ?? 0);
        setTotalPages(body.data.totalPages ?? 1);
        const visibleExpanded = [...expanded].filter((id) =>
          (body.data.items ?? []).some((operation: BulkStatusOperation) => operation.id === id),
        );
        await Promise.all(visibleExpanded.map((id) => loadDetail(id, true)));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load status changes";
        setLoadError(message);
        if (!quiet) toast.error(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [expanded, loadDetail, page],
  );

  useEffect(() => void load(), [load]);

  const hasActive = useMemo(
    () => operations.some((operation) => ACTIVE_STATUSES.has(operation.status)),
    [operations],
  );

  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => void load(true), 3_000);
    return () => window.clearInterval(timer);
  }, [hasActive, load]);

  useEffect(() => {
    if (initialOperationId) void loadDetail(initialOperationId);
  }, [initialOperationId, loadDetail]);

  async function toggle(id: string) {
    const opening = !expanded.has(id);
    setExpanded((current) => {
      const next = new Set(current);
      if (opening) next.add(id);
      else next.delete(id);
      return next;
    });
    if (opening && !details[id]) await loadDetail(id);
  }

  return (
    <section className="border-border bg-card overflow-hidden rounded-md border shadow-sm">
      <div className="border-border flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display-tight text-xl">Status changes</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Immediate Store lifecycle operations with a durable result for every Actor.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="bg-border space-y-px">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-none" />
          ))}
        </div>
      ) : loadError && operations.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <AlertTriangle className="text-destructive mx-auto h-7 w-7" />
          <p className="mt-4 font-medium">Status changes could not be loaded</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">{loadError}</p>
          <Button className="mt-5" variant="outline" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      ) : operations.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <History className="text-muted-foreground mx-auto h-7 w-7" />
          <p className="mt-4 font-medium">No status changes recorded</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            Select Actors in the inventory and apply a status change to create the first entry.
          </p>
        </div>
      ) : (
        <div className="divide-border divide-y">
          {operations.map((operation) => {
            const isExpanded = expanded.has(operation.id);
            const detail = details[operation.id];
            const isLoadingDetail = loadingDetails.has(operation.id);
            const progress = operation.actorCount
              ? Math.round((operation.completedCount / operation.actorCount) * 100)
              : 0;
            return (
              <article key={operation.id} id={`operation-${operation.id}`}>
                <button
                  type="button"
                  className="hover:bg-muted/20 w-full p-5 text-left transition-colors sm:p-6"
                  onClick={() => void toggle(operation.id)}
                  aria-expanded={isExpanded}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            operation.status === "FAILED"
                              ? "text-destructive"
                              : operation.status === "SUCCEEDED"
                                ? "text-signal-green"
                                : operation.status === "PARTIAL"
                                  ? "text-signal-orange"
                                  : "text-signal-blue"
                          }
                        >
                          <StatusIcon status={operation.status} />
                        </span>
                        <h3 className="font-display-tight text-lg">
                          {actionLabel(operation.action)}
                        </h3>
                        <Badge variant="outline" className={statusClasses(operation.status)}>
                          {operation.status.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-1.5 text-xs">
                        Started {formatDate(operation.startedAt ?? operation.createdAt)}
                        {operation.completedAt
                          ? ` · completed ${formatDate(operation.completedAt)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-6 lg:justify-end">
                      <div className="text-right text-xs">
                        <p className="font-medium">
                          {operation.succeededCount} succeeded · {operation.failedCount} failed
                        </p>
                        <p className="text-muted-foreground mt-1">
                          {operation.completedCount} of {operation.actorCount} complete
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="text-muted-foreground h-4 w-4" />
                      ) : (
                        <ChevronDown className="text-muted-foreground h-4 w-4" />
                      )}
                    </div>
                  </div>
                  {ACTIVE_STATUSES.has(operation.status) ? (
                    <div className="bg-muted mt-4 h-1.5 overflow-hidden rounded-full">
                      <div
                        className="bg-signal-blue h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${Math.max(progress, 3)}%` }}
                      />
                    </div>
                  ) : null}
                  {operation.error ? (
                    <p className="text-destructive mt-3 line-clamp-2 text-xs">{operation.error}</p>
                  ) : null}
                </button>

                {isExpanded ? (
                  <div className="border-border bg-muted/15 border-t">
                    {isLoadingDetail && !detail ? (
                      <div className="space-y-px p-4">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <Skeleton key={index} className="h-16 w-full" />
                        ))}
                      </div>
                    ) : detail?.items.length ? (
                      <div className="divide-border divide-y">
                        {detail.items.map((item) => (
                          <div
                            key={item.id}
                            className="grid gap-2 px-5 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_130px_190px] sm:items-center sm:px-6"
                          >
                            <div className="flex min-w-0 items-start gap-2.5">
                              <span
                                className={
                                  item.status === "SUCCEEDED"
                                    ? "text-signal-green"
                                    : item.status === "FAILED"
                                      ? "text-destructive"
                                      : "text-signal-blue"
                                }
                              >
                                <StatusIcon status={item.status} />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-medium">{item.label}</p>
                                <p className="text-muted-foreground mt-0.5 truncate font-mono text-[10px]">
                                  {item.apifyActorId}
                                </p>
                                {item.error ? (
                                  <p className="text-destructive mt-1 line-clamp-2">{item.error}</p>
                                ) : null}
                              </div>
                            </div>
                            <span className="text-muted-foreground font-mono uppercase">
                              {item.status.toLowerCase()}
                            </span>
                            <span className="text-muted-foreground">
                              {formatDate(item.completedAt ?? item.startedAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground px-6 py-6 text-center text-sm">
                        Per-Actor calls are not available.
                      </p>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {!loading && total > 0 ? (
        <div className="border-border flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            {total} operation{total === 1 ? "" : "s"} · page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
