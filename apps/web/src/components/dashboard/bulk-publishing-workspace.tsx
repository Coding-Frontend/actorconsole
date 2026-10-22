"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-base";
import { WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemsPerPageSelect } from "@/components/ui/items-per-page";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkPublishingHeader } from "@/components/dashboard/bulk-publishing-header";
import { WORKSPACE_CHANGED_EVENT } from "@/components/dashboard/onboarding-gate";
import { DEFAULT_PAGE_SIZE, normalizePageSize } from "@/lib/page-size";
import {
  DashboardAsyncState,
  PageActionMenu,
  ResponsiveFilterBar,
  SelectionActionBar,
} from "@/components/dashboard/dashboard-workbench";
import {
  type ActorItem,
  type ActorOperation,
  type ActorOperationState,
  type ReadinessFilter,
  type StoreFilter,
  savePublishingSelection,
} from "@/components/dashboard/bulk-publishing-types";

interface PendingStatusChange {
  label: string;
  description: string;
  payload: { underMaintenance?: boolean; isDeprecated?: boolean };
  destructive?: boolean;
}

const filters: Array<{ value: StoreFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "private", label: "Private" },
  { value: "maintenance", label: "Under maintenance" },
  { value: "deprecated", label: "Deprecated" },
  { value: "healthy", label: "Healthy" },
];

const readinessFilters: Array<{ value: ReadinessFilter; label: string }> = [
  { value: "all", label: "All readiness" },
  { value: "ready", label: "Ready to publish" },
  { value: "needs-attention", label: "Needs attention" },
  { value: "unknown", label: "Not checked" },
  { value: "missing-description", label: "Missing description" },
  { value: "missing-readme", label: "Missing README" },
  { value: "missing-input-schema", label: "Missing input schema" },
  { value: "missing-output-schema", label: "Missing output schema" },
  { value: "missing-key-value-store-schema", label: "Missing key-value schema" },
  { value: "missing-tagged-build", label: "Missing tagged build" },
  { value: "missing-public-profile", label: "Public profile required" },
  { value: "email-not-verified", label: "Email not verified" },
  { value: "disposable-email", label: "Disposable email" },
];

function publishingParam(name: string) {
  return typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get(name);
}

function initialStoreFilter(): StoreFilter {
  const value = publishingParam("status");
  return filters.some((filter) => filter.value === value) ? (value as StoreFilter) : "all";
}

function initialReadinessFilter(): ReadinessFilter {
  const value = publishingParam("readiness");
  return readinessFilters.some((filter) => filter.value === value)
    ? (value as ReadinessFilter)
    : "all";
}

function readinessIssues(actor: ActorItem) {
  if (!actor.readinessSyncedAt) return ["Not checked"];
  return [
    actor.hasDescription === false ? "Description" : null,
    actor.hasReadme === false ? "README" : null,
    actor.hasInputSchema === false ? "Input schema" : null,
    actor.hasOutputSchema === false ? "Output schema" : null,
    actor.hasKeyValueSchema === false ? "Key-value schema" : null,
    actor.hasTaggedBuild === false ? "Tagged build" : null,
    actor.hasPublicProfile === false ? "Public profile" : null,
    actor.hasVerifiedEmail === false ? "Verified email" : null,
    actor.hasNonDisposableEmail === false ? "Non-disposable email" : null,
    actor.publishReady === null ? "Not fully checked" : null,
  ].filter((value): value is string => Boolean(value));
}

function formatDate(value: string | null) {
  if (!value) return "Not checked";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not checked" : date.toLocaleString("en-IN");
}

function actorStatuses(actor: ActorItem) {
  const statuses = [];
  if (actor.storeIsPublic === true) {
    statuses.push({
      label: "Published",
      className: "border-signal-green/35 bg-signal-green/[0.06] text-signal-green",
    });
  } else if (actor.storeIsPublic === false) {
    statuses.push({
      label: "Private",
      className: "border-border bg-muted/40 text-muted-foreground",
    });
  } else {
    statuses.push({
      label: "Visibility unavailable",
      className: "border-signal-orange/35 bg-signal-orange/[0.06] text-signal-orange",
    });
  }
  if (actor.storeNotice === "UNDER_MAINTENANCE") {
    statuses.push({
      label: "Maintenance",
      className: "border-signal-orange/35 bg-signal-orange/[0.06] text-signal-orange",
    });
  }
  if (actor.storeIsDeprecated) {
    statuses.push({
      label: "Deprecated",
      className: "border-destructive/30 bg-destructive/[0.06] text-destructive",
    });
  }
  return statuses;
}

function operationIcon(status: ActorOperationState) {
  if (status === "RUNNING") return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (status === "SUCCEEDED") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "FAILED") return <XCircle className="h-3.5 w-3.5" />;
  return <Clock3 className="h-3.5 w-3.5" />;
}

export function BulkPublishingWorkspace() {
  const [actors, setActors] = useState<ActorItem[]>([]);
  const [selected, setSelected] = useState<Map<string, ActorItem>>(new Map());
  const [queryInput, setQueryInput] = useState(() => publishingParam("q") ?? "");
  const [query, setQuery] = useState(() => publishingParam("q") ?? "");
  const [status, setStatus] = useState<StoreFilter>(initialStoreFilter);
  const [readiness, setReadiness] = useState<ReadinessFilter>(initialReadinessFilter);
  const [page, setPage] = useState(() => Math.max(1, Number(publishingParam("page")) || 1));
  const [pageSize, setPageSize] = useState(() => normalizePageSize(publishingParam("limit")));
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [refreshStarting, setRefreshStarting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshJobId, setRefreshJobId] = useState<string | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<{
    total?: number;
    completed?: number;
  } | null>(null);
  const [pendingStatus, setPendingStatus] = useState<PendingStatusChange | null>(null);
  const [operation, setOperation] = useState<ActorOperation | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);
  const loadedViewRef = useRef<string | null>(null);
  const requestId = useRef(0);

  const clearSelection = useCallback(() => {
    setSelected(new Map());
    savePublishingSelection([]);
  }, []);

  // Inventory selections are intentionally scoped to the current view. The
  // session value only exists long enough to hand the current selection to the
  // schedule builder; it must never restore stale rows after a refresh/back
  // navigation or leak into another workspace.
  useEffect(() => {
    clearSelection();
  }, [clearSelection, page, pageSize, query, readiness, status]);

  useEffect(() => {
    window.addEventListener(WORKSPACE_CHANGED_EVENT, clearSelection);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, clearSelection);
  }, [clearSelection]);

  useEffect(() => {
    savePublishingSelection([...selected.values()]);
  }, [selected]);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const viewKey = JSON.stringify({ page, pageSize, query, readiness, status });
    const hasCurrentView = loadedViewRef.current === viewKey;
    setLoading(!hasCurrentView);
    setRevalidating(hasCurrentView);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        status,
        readiness,
        page: String(page),
        limit: String(pageSize),
      });
      if (query) params.set("q", query);
      const response = await fetch(`${API_BASE_URL}/bulk-publishing/inventory?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? "Could not load Actors");
      }
      if (currentRequest !== requestId.current) return;
      const nextActors = (body.data.items ?? []) as ActorItem[];
      loadedViewRef.current = viewKey;
      setActors(nextActors);
      setTotal(body.data.total ?? 0);
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      const message = error instanceof Error ? error.message : "Could not load Actors";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRevalidating(false);
      }
    }
  }, [page, pageSize, query, readiness, status]);

  useEffect(() => void load(), [load]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status !== "all") params.set("status", status);
    if (readiness !== "all") params.set("readiness", readiness);
    if (page > 1) params.set("page", String(page));
    if (pageSize !== DEFAULT_PAGE_SIZE) params.set("limit", String(pageSize));
    const queryString = params.toString();
    window.history.replaceState(
      null,
      "",
      queryString ? `/dashboard/publishing?${queryString}` : "/dashboard/publishing",
    );
  }, [page, pageSize, query, readiness, status]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refresh);
    return () => window.removeEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refresh);
  }, [load]);

  const startInventoryRefresh = useCallback(async () => {
    setRefreshStarting(true);
    setRefreshProgress(null);
    try {
      const response = await fetch(`${API_BASE_URL}/bulk-publishing/inventory/refresh`, {
        method: "POST",
        credentials: "include",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok || !body.data?.jobId) {
        throw new Error(body?.error?.message ?? "Could not queue the inventory refresh");
      }
      setRefreshJobId(String(body.data.jobId));
      toast.success("Inventory refresh queued. Cached Actors remain available while it runs.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the inventory refresh");
    } finally {
      setRefreshStarting(false);
    }
  }, []);

  useEffect(() => {
    if (!refreshJobId) return;
    let cancelled = false;

    async function pollRefresh() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/bulk-publishing/inventory/refresh/${refreshJobId}`,
          { credentials: "include", cache: "no-store" },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.ok) {
          throw new Error(body?.error?.message ?? "Could not read inventory refresh progress");
        }
        if (cancelled) return;
        const state = String(body.data.state ?? "waiting").toLowerCase();
        const progress = body.data.progress;
        if (progress && typeof progress === "object") {
          setRefreshProgress({
            total: Number(progress.total) || undefined,
            completed: Number(progress.completed) || 0,
          });
        }
        if (state === "completed") {
          const imported = Number(body.data.result?.importedActors) || 0;
          setRefreshJobId(null);
          setRefreshProgress(null);
          await load();
          toast.success(`Publishing inventory refreshed for ${imported} Actors`);
        } else if (state === "failed") {
          throw new Error(body.data.error ?? "Publishing inventory refresh failed");
        }
      } catch (error) {
        if (!cancelled) {
          setRefreshJobId(null);
          setRefreshProgress(null);
          toast.error(
            error instanceof Error ? error.message : "Could not refresh publishing inventory",
          );
        }
      }
    }

    void pollRefresh();
    const timer = window.setInterval(() => void pollRefresh(), 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load, refreshJobId]);

  useEffect(() => {
    const jobId = operation?.jobId;
    if (!jobId || !operation.active) return;
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`${API_BASE_URL}/bulk-publishing/operations/${jobId}`, {
          credentials: "include",
          cache: "no-store",
        });
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.ok) {
          throw new Error(body?.error?.message ?? "Could not read operation progress");
        }
        if (cancelled) return;
        const data = body.data;
        const state = String(data.state ?? "ACTIVE").toUpperCase();
        const terminalSuccess = state === "COMPLETED" || state === "SUCCEEDED";
        const terminalFailure = state === "FAILED";
        const progress = data.progress;

        setOperation((current) => {
          if (!current || current.jobId !== jobId) return current;
          const nextItems = { ...current.items };
          for (const item of progress?.items ?? []) {
            const previous = nextItems[item.actorId];
            nextItems[item.actorId] = {
              actorId: item.actorId,
              label: item.label ?? previous?.label ?? item.actorId,
              state: String(item.status ?? "QUEUED").toUpperCase() as ActorOperationState,
              error: item.error ?? previous?.error,
            };
          }
          if (terminalFailure) {
            for (const [actorId, item] of Object.entries(nextItems)) {
              if (item.state === "QUEUED" || item.state === "RUNNING") {
                nextItems[actorId] = {
                  ...item,
                  state: "FAILED",
                  error: data.error ?? "The operation stopped before this Actor was updated",
                };
              }
            }
          }
          const nextTotal = progress?.total ?? current.total;
          const nextSucceeded = progress?.succeeded ?? current.succeeded;
          const nextFailed = terminalFailure
            ? Object.values(nextItems).filter((item) => item.state === "FAILED").length
            : (progress?.failed ?? current.failed);
          return {
            ...current,
            state,
            active: !terminalSuccess && !terminalFailure,
            total: nextTotal,
            completed: terminalFailure ? nextTotal : (progress?.completed ?? current.completed),
            succeeded: nextSucceeded,
            failed: nextFailed,
            error: data.error ?? current.error,
            items: nextItems,
          };
        });

        if (terminalSuccess || terminalFailure) {
          if (terminalSuccess) toast.success("Bulk Actor operation completed");
          else toast.error(data.error ?? "Bulk Actor operation failed");
          await load();
        }
      } catch (error) {
        if (!cancelled) {
          setOperation((current) => {
            if (!current || current.jobId !== jobId) return current;
            return {
              ...current,
              active: false,
              state: "FAILED",
              error: error instanceof Error ? error.message : "Could not read operation progress",
            };
          });
          toast.error(error instanceof Error ? error.message : "Could not read operation progress");
        }
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load, operation?.active, operation?.jobId]);

  const allVisibleSelected = actors.length > 0 && actors.every((actor) => selected.has(actor.id));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  function toggle(actor: ActorItem) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(actor.id)) next.delete(actor.id);
      else next.set(actor.id, actor);
      return next;
    });
  }

  function toggleVisible() {
    setSelected((current) => {
      const next = new Map(current);
      for (const actor of actors) {
        if (allVisibleSelected) next.delete(actor.id);
        else next.set(actor.id, actor);
      }
      return next;
    });
  }

  async function selectAllMatching() {
    setSelectingAll(true);
    try {
      const params = new URLSearchParams({ status, readiness });
      if (query) params.set("q", query);
      const response = await fetch(
        `${API_BASE_URL}/bulk-publishing/inventory/selection?${params.toString()}`,
        { credentials: "include", cache: "no-store" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? "Could not select matching Actors");
      }
      const matching = (body.data.items ?? []) as ActorItem[];
      setSelected((current) => {
        const next = new Map(current);
        for (const actor of matching) next.set(actor.id, actor);
        return next;
      });
      toast.success(`${matching.length} matching Actors selected`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not select matching Actors");
    } finally {
      setSelectingAll(false);
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(queryInput.trim());
  }

  async function applyStatusChange() {
    if (!pendingStatus || selected.size === 0) return;
    const change = pendingStatus;
    const selectedActors = [...selected.values()];
    const items = Object.fromEntries(
      selectedActors.map((actor) => [
        actor.id,
        {
          actorId: actor.id,
          label: actor.title ?? `${actor.username}/${actor.actorName}`,
          state: "QUEUED" as const,
          error: undefined,
        },
      ]),
    );
    setPendingStatus(null);
    setOperation({
      jobId: null,
      operationId: null,
      state: "WAITING",
      label: change.label,
      startedAt: Date.now(),
      active: true,
      total: selectedActors.length,
      completed: 0,
      succeeded: 0,
      failed: 0,
      items,
    });

    try {
      const response = await fetch(`${API_BASE_URL}/bulk-publishing/actors/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actorIds: selectedActors.map((actor) => actor.id),
          ...change.payload,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok || !body.data?.jobId) {
        throw new Error(body?.error?.message ?? "Could not queue Actor operation");
      }
      setOperation((current) =>
        current
          ? {
              ...current,
              jobId: body.data.jobId,
              operationId: body.data.operationId ?? null,
              state: body.data.queued ? "QUEUED" : current.state,
            }
          : current,
      );
      toast.success("Bulk Actor operation queued");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not queue Actor operation";
      setOperation((current) =>
        current
          ? {
              ...current,
              active: false,
              state: "FAILED",
              failed: current.total,
              completed: current.total,
              error: message,
              items: Object.fromEntries(
                Object.entries(current.items).map(([actorId, item]) => [
                  actorId,
                  { ...item, state: "FAILED" as const, error: message },
                ]),
              ),
            }
          : current,
      );
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      <BulkPublishingHeader
        active="inventory"
        selectionCount={selected.size}
        onClearSelection={clearSelection}
      />

      {operation ? (
        <section className="border-border bg-card overflow-hidden rounded-md border shadow-sm">
          <div className="border-border bg-muted/20 flex flex-col gap-4 border-b px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="bg-signal-blue/10 text-signal-blue mt-0.5 flex h-9 w-9 items-center justify-center rounded-sm">
                {operation.active ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : operation.failed ? (
                  <ShieldAlert className="h-4 w-4" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </div>
              <div>
                <p className="font-display-tight text-lg">{operation.label}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {operation.active
                    ? `${operation.completed} of ${operation.total} complete · ${Object.values(operation.items).filter((item) => item.state === "RUNNING").length} running`
                    : `Finished with ${operation.succeeded} successful and ${operation.failed} failed`}
                </p>
                {operation.error ? (
                  <p className="text-destructive mt-1.5 max-w-2xl text-xs">{operation.error}</p>
                ) : null}
              </div>
            </div>
            {operation.operationId || !operation.active ? (
              <div className="flex flex-wrap gap-2">
                {operation.operationId ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link
                      href={`/dashboard/publishing/schedules?view=status-changes&operation=${operation.operationId}`}
                    >
                      View history
                    </Link>
                  </Button>
                ) : null}
                {!operation.active ? (
                  <Button size="sm" variant="outline" onClick={() => setOperation(null)}>
                    Dismiss report
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="bg-muted/40 h-1.5">
            <div
              className="bg-signal-blue h-full transition-[width] duration-500 ease-out"
              style={{
                width: `${operation.total ? (operation.completed / operation.total) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="bg-border grid max-h-64 gap-px overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(operation.items).map(([actorId, item]) => (
              <div key={actorId} className="bg-card flex min-w-0 items-start gap-3 px-4 py-3">
                <span
                  className={`mt-0.5 ${
                    item.state === "SUCCEEDED"
                      ? "text-signal-green"
                      : item.state === "FAILED"
                        ? "text-destructive"
                        : item.state === "RUNNING"
                          ? "text-signal-blue"
                          : "text-muted-foreground"
                  }`}
                >
                  {operationIcon(item.state)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.label}</p>
                  <p className="text-muted-foreground mt-0.5 truncate font-mono text-[10px] uppercase tracking-wide">
                    {item.state}
                  </p>
                  {item.error ? (
                    <p className="text-destructive mt-1 line-clamp-2 text-xs">{item.error}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="border-border bg-card overflow-visible rounded-md border shadow-sm">
        <div className="border-border flex flex-col gap-4 border-b p-4 sm:p-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CircleDashed className="text-signal-orange h-4 w-4" />
              <h2 className="font-display-tight text-xl">Actor inventory</h2>
            </div>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Inspect Store state and apply controlled changes across your portfolio.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void startInventoryRefresh()}
            disabled={refreshStarting || Boolean(refreshJobId) || operation?.active}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshStarting || refreshJobId ? "animate-spin" : ""}`}
            />
            {refreshStarting
              ? "Queueing refresh"
              : refreshJobId
                ? refreshProgress?.total
                  ? `Checking ${refreshProgress.completed ?? 0}/${refreshProgress.total}`
                  : "Refresh queued"
                : "Refresh from Apify"}
          </Button>
        </div>

        <div className="dashboard-filter-rail border-border bg-card/95 flex flex-col gap-3 border-b p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
          <form onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-2 xl:max-w-xl">
            <div className="relative min-w-0 flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search title, owner, or Actor name"
                aria-label="Search Actors"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
          <ResponsiveFilterBar
            activeCount={(status !== "all" ? 1 : 0) + (readiness !== "all" ? 1 : 0)}
            renderFilters={() => (
              <>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setPage(1);
                    setStatus(value as StoreFilter);
                  }}
                >
                  <SelectTrigger className="h-10 md:w-[190px]" aria-label="Filter Actor status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {filters.map((filter) => (
                      <SelectItem key={filter.value} value={filter.value}>
                        {filter.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={readiness}
                  onValueChange={(value) => {
                    setPage(1);
                    setReadiness(value as ReadinessFilter);
                  }}
                >
                  <SelectTrigger className="h-10 md:w-[210px]" aria-label="Filter Actor readiness">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {readinessFilters.map((filter) => (
                      <SelectItem key={filter.value} value={filter.value}>
                        {filter.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ItemsPerPageSelect
                  value={pageSize}
                  onChange={(nextPageSize) => {
                    setPage(1);
                    setPageSize(nextPageSize);
                  }}
                  label="Actors per page"
                  className="min-h-10 justify-between rounded-sm border px-3"
                />
              </>
            )}
          />
        </div>

        {!loading && total > actors.length && selected.size === 0 ? (
          <div className="border-border bg-muted/15 flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-muted-foreground text-xs">
              The checkbox selects this page. Select all to include every result across pagination.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={selectingAll}
              onClick={() => void selectAllMatching()}
            >
              {selectingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Select all {total} matching Actors
            </Button>
          </div>
        ) : null}

        {selected.size > 0 ? (
          <div className="border-border border-b px-4 py-3 sm:px-5">
            <SelectionActionBar
              count={selected.size}
              noun="Actor"
              description="Selection clears when the inventory view or workspace changes."
              onClear={clearSelection}
              className="static"
            >
              {selected.size < total ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={selectingAll || operation?.active}
                  onClick={() => void selectAllMatching()}
                >
                  {selectingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Select all {total} matching
                </Button>
              ) : null}
              <PageActionMenu
                label="Change selected Actor status"
                triggerText="Change status"
                items={[
                  {
                    label: "Clear maintenance",
                    disabled: operation?.active,
                    onSelect: () =>
                      setPendingStatus({
                        label: "Clear maintenance",
                        description:
                          "Remove both the under-maintenance and deprecated statuses from every selected Actor? Each Actor will report its own result.",
                        payload: { underMaintenance: false, isDeprecated: false },
                      }),
                  },
                  {
                    label: "Mark under maintenance",
                    disabled: operation?.active,
                    onSelect: () =>
                      setPendingStatus({
                        label: "Mark under maintenance",
                        description:
                          "Show an under-maintenance notice on every selected Actor? Each Actor will report its own result.",
                        payload: { underMaintenance: true },
                      }),
                  },
                  {
                    label: "Clear deprecated status",
                    disabled: operation?.active,
                    onSelect: () =>
                      setPendingStatus({
                        label: "Clear deprecated status",
                        description:
                          "Mark every selected Actor as not deprecated? Each Actor will report its own result.",
                        payload: { isDeprecated: false },
                      }),
                  },
                  {
                    label: "Mark deprecated",
                    disabled: operation?.active,
                    destructive: true,
                    onSelect: () =>
                      setPendingStatus({
                        label: "Mark deprecated",
                        description:
                          "Mark every selected Actor as deprecated in Apify Store? Each Actor will report its own result.",
                        payload: { isDeprecated: true },
                        destructive: true,
                      }),
                  },
                ]}
              />
              <Button size="sm" variant="signal" asChild>
                <Link href={`/dashboard/publishing/schedules/new?selected=${selected.size}`}>
                  Create schedule <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </SelectionActionBar>
          </div>
        ) : null}

        {refreshJobId || revalidating ? (
          <div
            className="border-border/70 bg-signal-blue/[0.035] text-muted-foreground flex items-center gap-2 border-b px-4 py-2 text-xs sm:px-5"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="text-signal-blue h-3.5 w-3.5 shrink-0 animate-spin" />
            <span>
              {refreshJobId
                ? refreshProgress?.total
                  ? `Apify refresh ${refreshProgress.completed ?? 0} of ${refreshProgress.total}. Cached inventory remains available.`
                  : "Apify refresh is queued. Cached inventory remains available."
                : "Updating this inventory view from the local workspace cache."}
            </span>
          </div>
        ) : null}
        {loadError && actors.length > 0 ? (
          <DashboardAsyncState
            status="warning"
            title="Showing cached publishing inventory"
            description={loadError}
            onRetry={() => void load()}
            className="mx-4 mt-4 sm:mx-5"
          />
        ) : null}

        {loading ? (
          <div className="bg-border space-y-px">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-none" />
            ))}
          </div>
        ) : actors.length === 0 && loadError ? (
          <DashboardAsyncState
            status="error"
            title="Could not load publishing inventory"
            description={loadError}
            onRetry={() => void load()}
            className="m-4 sm:m-5"
          />
        ) : actors.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <Wrench className="text-muted-foreground mx-auto h-6 w-6" />
            <p className="mt-4 font-medium">No Actors match this view</p>
            <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
              Change the search or status filter, or refresh your inventory from Apify.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-border divide-y md:hidden">
              {actors.map((actor) => {
                const isSelected = selected.has(actor.id);
                const issues = readinessIssues(actor);
                return (
                  <label
                    key={actor.id}
                    className={`block p-4 transition-colors ${isSelected ? "bg-signal-blue/[0.055]" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(actor)}
                        aria-label={`Select ${actor.title ?? actor.actorName}`}
                        className="accent-signal-orange mt-1 h-4 w-4"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {actor.title ?? actor.actorName}
                        </p>
                        <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                          {actor.username}/{actor.actorName}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 pl-7">
                      {actorStatuses(actor).map((item) => (
                        <Badge key={item.label} variant="outline" className={item.className}>
                          {item.label}
                        </Badge>
                      ))}
                      <Badge
                        variant="outline"
                        className={
                          issues.length === 0
                            ? "border-signal-green/35 bg-signal-green/[0.06] text-signal-green"
                            : "border-signal-orange/35 bg-signal-orange/[0.06] text-signal-orange"
                        }
                      >
                        {issues.length === 0 ? "Ready" : `${issues.length} readiness issues`}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-3 pl-7 text-[11px]">
                      Verified {formatDate(actor.readinessSyncedAt ?? actor.storeStatusSyncedAt)}
                    </p>
                  </label>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="bg-muted/35 text-muted-foreground border-border border-b text-left font-mono text-[10px] uppercase tracking-[0.14em]">
                  <tr>
                    <th className="w-14 px-5 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisible}
                        aria-label="Select all visible Actors"
                        className="accent-signal-orange h-4 w-4"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                    <th className="px-4 py-3 font-medium">Store state</th>
                    <th className="px-4 py-3 font-medium">Publish readiness</th>
                    <th className="px-4 py-3 font-medium">Last verified</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {actors.map((actor) => {
                    const isSelected = selected.has(actor.id);
                    return (
                      <tr
                        key={actor.id}
                        className={`transition-colors ${isSelected ? "bg-signal-blue/[0.055]" : "hover:bg-muted/20"}`}
                      >
                        <td className="px-5 py-3.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(actor)}
                            aria-label={`Select ${actor.title ?? actor.actorName}`}
                            className="accent-signal-orange h-4 w-4"
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border font-mono text-xs font-semibold">
                              {(actor.title ?? actor.actorName).slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {actor.title ?? actor.actorName}
                              </p>
                              <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                                {actor.username}/{actor.actorName}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            {actorStatuses(actor).map((item) => (
                              <Badge key={item.label} variant="outline" className={item.className}>
                                {item.label}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {readinessIssues(actor).length === 0 ? (
                            <Badge
                              variant="outline"
                              className="border-signal-green/35 bg-signal-green/[0.06] text-signal-green"
                            >
                              Ready
                            </Badge>
                          ) : (
                            <div className="flex max-w-[310px] flex-wrap gap-1.5">
                              {readinessIssues(actor).map((issue) => (
                                <Badge
                                  key={issue}
                                  variant="outline"
                                  className="border-signal-orange/35 bg-signal-orange/[0.06] text-signal-orange"
                                >
                                  {issue}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="text-muted-foreground px-4 py-3.5 text-xs">
                          {formatDate(actor.readinessSyncedAt ?? actor.storeStatusSyncedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="border-border flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-muted-foreground text-xs">
            {total
              ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
              : "No results"}
            {selected.size ? ` · ${selected.size} selected across pages` : ""}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground mr-1 text-xs">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1 || loading}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((current) => current + 1)}
              disabled={page >= totalPages || loading}
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(pendingStatus)}
        onOpenChange={(open) => {
          if (!open) setPendingStatus(null);
        }}
        title={`${pendingStatus?.label ?? "Update status"}?`}
        description={pendingStatus?.description ?? "Update the selected Actors?"}
        confirmLabel={pendingStatus?.label ?? "Update"}
        destructive={pendingStatus?.destructive}
        onConfirm={applyStatusChange}
      />
    </div>
  );
}
