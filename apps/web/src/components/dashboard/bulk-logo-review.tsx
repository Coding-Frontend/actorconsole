"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageIcon,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WORKSPACE_CHANGED_EVENT } from "./onboarding-gate";
import { DashboardBreadcrumbs } from "./dashboard-workbench";
import { WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
import { cn } from "@/lib/utils";
import {
  logoReviewParams,
  logoReviewRequest,
  runLogoReviewBatch,
  selectAllLogoReviews,
  type LogoReviewAction,
  type LogoReviewFilters,
  type LogoReviewItem,
  type LogoReviewPage,
  type LogoReviewResult,
  type LogoReviewSelection,
  type LogoReviewStatus,
} from "@/lib/logo-review";

const initialFilters: LogoReviewFilters = {
  status: "PENDING",
  query: "",
  websiteId: "",
  thumbnail: "all",
};
const statuses: Array<{ value: LogoReviewStatus; label: string }> = [
  { value: "PENDING", label: "Needs review" },
  { value: "APPLIED", label: "Applied" },
  { value: "DISMISSED", label: "Dismissed" },
];
const selectClass =
  "h-11 min-w-0 rounded-sm border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const checkboxClass =
  "h-5 w-5 cursor-pointer accent-signal-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed";
const actorTitle = (item: LogoReviewSelection) => item.actor.title || item.actor.actorName;
const logos = (count: number) => `${count} logo${count === 1 ? "" : "s"}`;

type Batch = {
  action: LogoReviewAction;
  total: number;
  running: boolean;
  stopping: boolean;
  current: string | null;
  results: LogoReviewResult[];
};

function Thumbnail({
  item,
  proposed,
  onPreview,
}: {
  item: LogoReviewItem;
  proposed?: boolean;
  onPreview: () => void;
}) {
  const title = actorTitle(item);
  const src = proposed ? item.proposedImageUrl : item.actor.currentImageUrl;
  return (
    <div className="flex flex-col items-start gap-2 xl:items-center">
      <span className="text-xs text-muted-foreground xl:sr-only">
        {proposed ? "Proposed logo" : "Current thumbnail"}
      </span>
      {src ? (
        <button
          type="button"
          onClick={onPreview}
          aria-label={`Enlarge ${proposed ? "proposed logo" : "current thumbnail"} for ${title}`}
          className="hover:border-signal-orange/70 grid h-16 w-16 shrink-0 place-items-center rounded-md border border-border bg-background p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src={src}
            alt={`${title} ${proposed ? "proposed logo" : "Apify thumbnail"}`}
            width={64}
            height={64}
            unoptimized
            className="h-full w-full object-contain"
          />
        </button>
      ) : (
        <span
          aria-label={`${title} has no Apify thumbnail`}
          className="grid h-16 w-16 place-items-center rounded-md border border-border bg-muted/30 text-xl font-medium text-muted-foreground"
        >
          {item.actor.actorName.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function BulkLogoReview() {
  const [filters, setFilters] = useState(initialFilters);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<LogoReviewPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(new Map<string, LogoReviewSelection>());
  const [selecting, setSelecting] = useState(false);
  const [confirm, setConfirm] = useState<LogoReviewAction | null>(null);
  const [preview, setPreview] = useState<LogoReviewItem | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const version = useRef(0);
  const loadedWorkspace = useRef<string | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const selectionController = useRef<AbortController | null>(null);
  const batchController = useRef<AbortController | null>(null);
  const stopRequested = useRef(false);

  const changeFilters = useCallback((change: Partial<LogoReviewFilters>) => {
    setFilters((current) => ({ ...current, ...change }));
    setPage(1);
    setSelected(new Map());
    setConfirm(null);
  }, []);

  useEffect(() => {
    if (search.trim() === filters.query) return;
    const timer = window.setTimeout(() => changeFilters({ query: search.trim() }), 300);
    return () => window.clearTimeout(timer);
  }, [search, filters.query, changeFilters]);

  useEffect(() => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    setLoadError("");
    const params = logoReviewParams(filters);
    params.set("page", String(page));
    params.set("limit", String(limit));
    params.set("summary", "true");
    void logoReviewRequest<LogoReviewPage>(`?${params}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.workspaceId || !result.summary)
          throw new Error("Could not load logo reviews. Please refresh this page.");
        if (loadedWorkspace.current && loadedWorkspace.current !== result.workspaceId) {
          version.current += 1;
          selectionController.current?.abort();
          batchController.current?.abort();
          batchController.current = null;
          stopRequested.current = true;
          setSelected(new Map());
          setConfirm(null);
          setPreview(null);
          setBatch(null);
          setSelecting(false);
        }
        loadedWorkspace.current = result.workspaceId;
        const lastPage = Math.max(1, Math.ceil(result.total / limit));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(result);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : "Could not load logo reviews.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, page, limit, reload]);

  useEffect(() => {
    const changed = () => {
      version.current += 1;
      loadedWorkspace.current = null;
      loadController.current?.abort();
      selectionController.current?.abort();
      batchController.current?.abort();
      batchController.current = null;
      stopRequested.current = true;
      setData(null);
      setSelected(new Map());
      setSelecting(false);
      setConfirm(null);
      setPreview(null);
      setBatch(null);
      setSearch("");
      setFilters(initialFilters);
      setPage(1);
      setReload((value) => value + 1);
    };
    const refreshed = () => {
      if (!batchController.current) setReload((value) => value + 1);
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, changed);
    window.addEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refreshed);
    return () => {
      version.current += 1;
      loadController.current?.abort();
      selectionController.current?.abort();
      batchController.current?.abort();
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, changed);
      window.removeEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refreshed);
    };
  }, []);

  useEffect(() => {
    if (!batch?.running) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [batch?.running]);

  const busy = Boolean(batch?.running) || selecting;
  const disabled =
    busy || loading || Boolean(loadError) || !data || search.trim() !== filters.query;
  const pending = filters.status === "PENDING";
  const items = data?.items ?? [];
  const allOnPage = items.length > 0 && items.every((item) => selected.has(item.id));
  const someOnPage = items.some((item) => selected.has(item.id));
  const counts = data?.summary.counts;
  const successCount = batch?.results.filter((result) => result.outcome !== "failed").length ?? 0;
  const failedCount = batch?.results.filter((result) => result.outcome === "failed").length ?? 0;
  const notStarted = batch ? batch.total - batch.results.length : 0;

  function toggle(item: LogoReviewSelection) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  }

  async function selectAll() {
    if (!data || disabled) return;
    const currentVersion = version.current;
    const controller = new AbortController();
    selectionController.current = controller;
    setSelecting(true);
    try {
      const result = await selectAllLogoReviews(filters, data.workspaceId, controller.signal);
      if (!controller.signal.aborted && currentVersion === version.current)
        setSelected(new Map(result.map((item) => [item.id, item])));
    } catch (error) {
      if (!controller.signal.aborted)
        toast.error(error instanceof Error ? error.message : "Could not select Actors.");
    } finally {
      if (currentVersion === version.current) setSelecting(false);
    }
  }

  async function run(action: LogoReviewAction) {
    if (!data || disabled || !selected.size || batchController.current) return;
    const queue = [...selected.values()];
    const currentVersion = version.current;
    const workspaceId = data.workspaceId;
    const controller = new AbortController();
    batchController.current = controller;
    stopRequested.current = false;
    setConfirm(null);
    setBatch({
      action,
      total: queue.length,
      running: true,
      stopping: false,
      current: null,
      results: [],
    });
    const results = await runLogoReviewBatch({
      action,
      items: queue,
      workspaceId,
      signal: controller.signal,
      shouldStop: () => stopRequested.current,
      onProgress: (current, completed) => {
        if (currentVersion === version.current && !controller.signal.aborted)
          setBatch((previous) =>
            previous
              ? { ...previous, current: current ? actorTitle(current) : null, results: completed }
              : previous,
          );
      },
    });
    if (currentVersion !== version.current || controller.signal.aborted) return;
    batchController.current = null;
    const remaining = new Map(queue.map((item) => [item.id, item]));
    for (const result of results)
      if (result.outcome !== "failed" || !result.retryable) remaining.delete(result.id);
    setSelected(remaining);
    setBatch((previous) =>
      previous
        ? { ...previous, running: false, stopping: false, current: null, results }
        : previous,
    );
    const successful = results.filter((result) => result.outcome !== "failed").length;
    const failed = results.length - successful;
    if (failed)
      toast.error(
        `${successful} ${action === "apply" ? "applied" : "dismissed"}; ${failed} need attention.`,
      );
    else
      toast.success(
        `${logos(successful)} ${action === "apply" ? "applied on Apify" : "dismissed"}.`,
      );
    window.dispatchEvent(new CustomEvent(WORKSPACE_DATA_REFRESHED_EVENT));
  }

  return (
    <section className="min-w-0 space-y-6 pb-6" aria-label="Bulk logo review workspace">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DashboardBreadcrumbs
            items={[{ label: "Actors", href: "/dashboard/actors" }, { label: "Logo review" }]}
          />
          <Link
            href="/dashboard/actors"
            aria-disabled={busy}
            onClick={(event) => {
              if (busy) event.preventDefault();
            }}
            className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Actors
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display-tight text-3xl font-semibold tracking-tight sm:text-4xl">
            Bulk logo review
          </h2>
          {counts ? (
            <span className="rounded-sm border border-border px-2.5 py-1 text-xs font-medium">
              {counts.PENDING} ready
            </span>
          ) : null}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Compare thumbnails and update multiple Actors in one place.
        </p>
      </header>

      <div
        className="flex gap-2 overflow-x-auto border-b border-border"
        role="group"
        aria-label="Review status"
      >
        {statuses.map((status) => (
          <button
            key={status.value}
            type="button"
            disabled={busy}
            aria-pressed={filters.status === status.value}
            onClick={() => changeFilters({ status: status.value })}
            className={cn(
              "inline-flex min-h-12 shrink-0 items-center gap-1.5 border-b-2 px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-sm",
              filters.status === status.value
                ? "border-signal-orange text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {status.label}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
              {counts?.[status.value] ?? "—"}
            </span>
          </button>
        ))}
      </div>

      <div
        className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,2fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_auto]"
        aria-label="Logo review filters"
      >
        <div className="relative sm:col-span-2 xl:col-span-1">
          <Search
            className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Search Actors or websites"
            placeholder="Search Actors or websites"
            value={search}
            maxLength={200}
            disabled={busy}
            onChange={(event) => {
              setSearch(event.target.value);
              setSelected(new Map());
            }}
            className="h-11 pl-10"
          />
        </div>
        <select
          aria-label="Website"
          className={cn(selectClass, "col-span-2 sm:col-span-1")}
          value={filters.websiteId}
          disabled={busy}
          onChange={(event) => changeFilters({ websiteId: event.target.value })}
        >
          <option value="">All websites</option>
          {data?.summary.websites.map((website) => (
            <option key={website.id} value={website.id}>
              {website.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Thumbnail"
          className={cn(selectClass, "col-span-2 sm:col-span-1")}
          value={filters.thumbnail}
          disabled={busy}
          onChange={(event) =>
            changeFilters({ thumbnail: event.target.value as LogoReviewFilters["thumbnail"] })
          }
        >
          <option value="all">All thumbnails</option>
          <option value="missing">Missing Apify thumbnail</option>
          <option value="existing">Has Apify thumbnail</option>
        </select>
        <Button
          type="button"
          variant="outline"
          loading={loading}
          disabled={!loading && busy}
          aria-label="Refresh logo reviews"
          className="col-start-2 row-start-1 h-11 px-3 sm:col-span-2 sm:col-start-auto sm:row-start-auto xl:col-span-1"
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw
            className={cn("h-4 w-4", loading && "animate-spin motion-reduce:animate-none")}
            aria-hidden="true"
          />
          <span className="sr-only sm:not-sr-only xl:sr-only">Refresh</span>
        </Button>
      </div>

      {pending ? (
        <div
          className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 text-sm"
          aria-live="polite"
        >
          <span className="font-medium tabular-nums">{selected.size} selected</span>
          {data && data.total > 0 && selected.size < data.total ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => void selectAll()}
              className="min-h-11 text-signal-orange underline underline-offset-4 disabled:opacity-50"
            >
              {selecting ? "Selecting Actors…" : `Select all ${data.total} matching`}
            </button>
          ) : null}
          {selected.size ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(new Map())}
              className="min-h-11 text-muted-foreground underline underline-offset-4 disabled:opacity-50"
            >
              Clear selection
            </button>
          ) : null}
        </div>
      ) : null}

      {batch ? (
        <section
          aria-label="Bulk logo results"
          className="space-y-3 rounded-md border border-border bg-card p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="status" aria-live="polite">
              <p className="font-medium">
                {batch.running
                  ? batch.action === "apply"
                    ? "Applying logos"
                    : "Dismissing recommendations"
                  : notStarted
                    ? "Bulk review stopped"
                    : "Bulk review complete"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {batch.results.length} of {batch.total} processed · {successCount}{" "}
                {batch.action === "apply" ? "applied" : "dismissed"} · {failedCount} failed
                {!batch.running && notStarted ? ` · ${notStarted} not started` : ""}
              </p>
            </div>
            {batch.running ? (
              <Button
                type="button"
                variant="outline"
                loading={batch.stopping}
                loadingText="Stopping after current Actor…"
                onClick={() => {
                  stopRequested.current = true;
                  setBatch((current) => (current ? { ...current, stopping: true } : current));
                }}
              >
                Stop after current
              </Button>
            ) : null}
          </div>
          <progress
            aria-label="Bulk logo progress"
            value={batch.results.length}
            max={batch.total}
            className="h-2 w-full accent-signal-orange"
          />
          {batch.running ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {batch.current ? `Processing ${batch.current}. ` : ""}Keep this page open while
              updates run. Completed changes are saved.
            </p>
          ) : null}
          {batch.results.length ? (
            <details open={failedCount > 0} className="text-sm">
              <summary className="min-h-11 cursor-pointer py-3 font-medium">
                Per-Actor results ({batch.results.length})
              </summary>
              <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                {batch.results.map((result) => (
                  <li key={result.id} className="flex items-start gap-3 py-3">
                    {result.outcome === "failed" ? (
                      <XCircle
                        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                        aria-hidden="true"
                      />
                    ) : (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-signal-green"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="break-words font-medium">
                        {actorTitle(result)}{" "}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {result.outcome === "applied"
                            ? "Applied"
                            : result.outcome === "dismissed"
                              ? "Dismissed"
                              : "Failed"}
                        </span>
                      </p>
                      {result.message ? (
                        <p className="mt-1 break-words text-xs leading-5 text-destructive">
                          {result.message}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {!batch.running && failedCount ? (
            <Link
              href="/dashboard/apify"
              className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
            >
              Check Apify connection
            </Link>
          ) : null}
        </section>
      ) : null}

      {loadError ? (
        <Alert
          tone="danger"
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => setReload((value) => value + 1)}
            >
              Try again
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : loading && !data ? (
        <p role="status" className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Spinner decorative size="md" />
          Loading logo reviews…
        </p>
      ) : items.length ? (
        <div
          className={cn("min-w-0 rounded-md border border-border bg-card", loading && "opacity-60")}
          aria-busy={loading}
        >
          <table
            aria-label="Actor logo comparisons"
            className="block w-full border-separate border-spacing-0 xl:table [&_a]:scroll-mb-44 [&_button]:scroll-mb-44 [&_input]:scroll-mb-44"
          >
            <thead className="hidden xl:table-header-group">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="w-14 border-b border-border p-3 font-medium">
                  {pending ? (
                    <input
                      type="checkbox"
                      aria-label="Select all Actors on this page"
                      className={checkboxClass}
                      disabled={disabled}
                      checked={allOnPage}
                      ref={(node) => {
                        if (node) node.indeterminate = someOnPage && !allOnPage;
                      }}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Map(current);
                          for (const item of items) {
                            if (allOnPage) next.delete(item.id);
                            else next.set(item.id, item);
                          }
                          return next;
                        })
                      }
                    />
                  ) : null}
                </th>
                <th className="border-b border-border px-3 py-4 font-medium">Actor</th>
                <th className="w-32 border-b border-border px-3 py-4 text-center font-medium">
                  Current thumbnail
                </th>
                <th className="w-8 border-b border-border" aria-label="Changes to" />
                <th className="w-32 border-b border-border px-3 py-4 text-center font-medium">
                  Proposed logo
                </th>
                <th className="border-b border-border px-3 py-4 font-medium">Website</th>
                <th className="border-b border-border px-3 py-4 font-medium">Status</th>
                <th className="w-14 border-b border-border p-3">
                  <span className="sr-only">Actor details</span>
                </th>
              </tr>
            </thead>
            <tbody className="block xl:table-row-group">
              {items.map((item) => {
                const title = actorTitle(item);
                const checked = selected.has(item.id);
                return (
                  <tr
                    key={item.id}
                    data-recommendation-id={item.id}
                    className={cn(
                      "relative grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem] gap-x-2 gap-y-3 border-b border-border p-4 last:border-b-0 xl:table-row xl:p-0 [&:last-child>td]:xl:border-b-0 [&>td]:xl:border-b [&>td]:xl:border-border [&>td]:xl:px-3 [&>td]:xl:py-4 [&>td]:xl:align-middle",
                      checked &&
                        "bg-signal-orange/[0.07] [&>td:first-child]:xl:border-l-signal-orange",
                    )}
                  >
                    <td className="row-span-2 xl:w-14 xl:border-l-[3px] xl:border-l-transparent">
                      {pending ? (
                        <label className="inline-flex min-h-11 items-center">
                          <input
                            type="checkbox"
                            aria-label={`Select ${title} for logo review`}
                            className={checkboxClass}
                            disabled={disabled}
                            checked={checked}
                            onChange={() => toggle(item)}
                          />
                        </label>
                      ) : null}
                    </td>
                    <td className="col-span-2 min-w-0">
                      <Link
                        href={`/dashboard/actors/${item.actor.id}`}
                        target="_blank"
                        rel="noreferrer"
                        prefetch={false}
                        className="break-words text-sm font-semibold hover:underline"
                      >
                        {title}
                      </Link>
                      <p className="mt-1 break-all font-mono text-xs leading-5 text-muted-foreground">
                        {item.actor.username}/{item.actor.actorName}
                      </p>
                    </td>
                    <td className="col-start-2 row-start-2">
                      <Thumbnail item={item} onPreview={() => setPreview(item)} />
                    </td>
                    <td className="hidden xl:table-cell">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </td>
                    <td className="col-start-3 row-start-2">
                      <Thumbnail item={item} proposed onPreview={() => setPreview(item)} />
                    </td>
                    <td className="col-span-2 col-start-2 min-w-0 text-sm">
                      <span className="break-words">
                        {item.logo.websiteIdentity.canonicalDomain ||
                          item.logo.websiteIdentity.name}
                      </span>
                    </td>
                    <td className="col-span-2 col-start-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-2 text-xs font-medium",
                          item.error ? "text-destructive" : "text-foreground",
                        )}
                      >
                        {item.error ? (
                          <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <CheckCircle2
                            className="h-4 w-4 shrink-0 text-signal-green"
                            aria-hidden="true"
                          />
                        )}
                        {item.status === "APPLIED"
                          ? "Applied"
                          : item.status === "DISMISSED"
                            ? "Dismissed"
                            : item.error
                              ? "Needs attention"
                              : "Reviewed"}
                      </span>
                      {item.error ? (
                        <p className="mt-2 max-w-64 break-words text-xs leading-5 text-destructive">
                          {item.error}
                        </p>
                      ) : null}
                    </td>
                    <td className="col-start-4 row-start-1">
                      <Link
                        href={`/dashboard/actors/${item.actor.id}`}
                        target="_blank"
                        rel="noreferrer"
                        prefetch={false}
                        aria-label={`Open ${title} in a new tab`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid place-items-center rounded-md border border-dashed border-border px-5 py-16 text-center">
          <ImageIcon className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="font-medium">
            {filters.query || filters.websiteId || filters.thumbnail !== "all"
              ? "No logos match these filters"
              : pending
                ? "All caught up"
                : `No ${filters.status.toLowerCase()} logos yet`}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {pending
              ? "Reviewed website logos will appear here when they are available for your Actors."
              : "Your completed logo decisions will appear here."}
          </p>
          {filters.query || filters.websiteId || filters.thumbnail !== "all" ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => {
                setSearch("");
                changeFilters({ query: "", websiteId: "", thumbnail: "all" });
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      )}

      {data && !loadError ? (
        <nav
          aria-label="Logo review pagination"
          className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"
        >
          <span>
            {data.total
              ? `Showing ${(data.page - 1) * data.limit + 1}–${Math.min(data.page * data.limit, data.total)} of ${data.total} Actors`
              : "0 Actors"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              Per page
              <select
                aria-label="Logos per page"
                value={limit}
                disabled={busy || loading}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  setPage(1);
                }}
                className={cn(selectClass, "h-11 text-xs")}
              >
                <option>10</option>
                <option>25</option>
                <option>50</option>
                <option>100</option>
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              className="h-11 px-3"
              aria-label="Previous logo page"
              disabled={busy || loading || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span className="tabular-nums">
              {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))}
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-11 px-3"
              aria-label="Next logo page"
              disabled={busy || loading || page * limit >= data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </nav>
      ) : null}

      {selected.size || batch?.running ? (
        <div
          role="region"
          aria-label="Bulk logo actions"
          className="sticky bottom-0 z-20 flex flex-col gap-3 rounded-md border border-border bg-card p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div>
            <p className="text-sm font-semibold tabular-nums sm:text-base">
              {selected.size} Actor{selected.size === 1 ? "" : "s"} selected
            </p>
            <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
              Each change is verified on Apify. Only selected Actors will be updated.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              type="button"
              variant="outline"
              aria-label="Dismiss selected"
              className="h-11 min-w-0 px-3 sm:px-5"
              disabled={disabled || !selected.size}
              onClick={() => setConfirm("dismiss")}
            >
              <span className="sm:hidden">Dismiss</span>
              <span className="hidden sm:inline">Dismiss selected</span>
            </Button>
            <Button
              type="button"
              variant="signal"
              aria-label={`Apply ${logos(selected.size)} to Apify`}
              className="h-11 min-w-0 px-3 dark:text-primary-foreground sm:px-5"
              loading={Boolean(batch?.running)}
              disabled={!batch?.running && (disabled || !selected.size)}
              onClick={() => setConfirm("apply")}
            >
              <span className="sm:hidden">Apply {logos(selected.size)}</span>
              <span className="hidden sm:inline">Apply {logos(selected.size)} to Apify</span>
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "apply"
                ? `Apply ${logos(selected.size)} to Apify?`
                : `Dismiss ${selected.size} recommendation${selected.size === 1 ? "" : "s"}?`}
            </DialogTitle>
            <DialogDescription>
              {confirm === "apply"
                ? "The proposed logos will replace the Apify thumbnails for these selected Actors. Each update is verified before it is recorded as applied."
                : "These recommendations will move to Dismissed. Their Apify thumbnails will stay as they are."}
            </DialogDescription>
          </DialogHeader>
          <ul
            aria-label="Actors in this bulk action"
            className="max-h-60 space-y-2 overflow-y-auto rounded-sm border border-border p-3 text-sm"
          >
            {[...selected.values()].map((item) => (
              <li key={item.id} className="break-words">
                {actorTitle(item)}
              </li>
            ))}
          </ul>
          <p className="text-xs leading-5 text-muted-foreground">
            Keep this page open while the selected updates run. You can stop after the current
            Actor.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirm === "apply" ? "signal" : "default"}
              className="dark:text-primary-foreground"
              disabled={disabled || !selected.size}
              onClick={() => {
                if (confirm) void run(confirm);
              }}
            >
              {confirm === "apply"
                ? `Apply ${logos(selected.size)}`
                : `Dismiss ${selected.size} selected`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compare Actor thumbnails</DialogTitle>
            <DialogDescription>{preview ? actorTitle(preview) : ""}</DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Current Apify thumbnail", src: preview.actor.currentImageUrl },
                { label: "Proposed website logo", src: preview.proposedImageUrl },
              ].map((image) => (
                <div key={image.label} className="space-y-3">
                  <p className="text-xs text-muted-foreground">{image.label}</p>
                  <div className="grid aspect-square place-items-center rounded-md border border-border bg-background p-4">
                    {image.src ? (
                      <Image
                        src={image.src}
                        alt={image.label}
                        width={256}
                        height={256}
                        unoptimized
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-3xl text-muted-foreground">
                        {preview.actor.actorName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
