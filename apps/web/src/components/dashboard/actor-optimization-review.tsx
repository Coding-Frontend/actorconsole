"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-base";
import { trackEvent } from "@/lib/analytics-events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";

type OptimizationField = "title" | "description" | "pricing";
type ListingState = {
  title: string;
  description: string;
  categories?: string[];
  readme: string;
  pricing?: Record<string, unknown> | null;
};
type OptimizationResult = {
  id: string;
  status: string;
  currentState: ListingState | null;
  proposedState: ListingState | null;
  currentScore: number | null;
  proposedScore: number | null;
  improvementPoints: number | null;
  improvementPercent: number | null;
  issues: {
    items?: Array<{ field: string; severity: string; message: string }>;
    summary?: string;
  } | null;
  approvedFields: OptimizationField[] | null;
  error: string | null;
  actor: {
    id: string;
    apifyActorId: string;
    username: string;
    actorName: string;
    title: string | null;
  };
};
type OptimizationRun = {
  id: string;
  kind: string;
  requestedFields: OptimizationField[] | null;
  status: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  appliedCount: number;
  results: OptimizationResult[];
};

const fields: Array<{ key: OptimizationField; label: string }> = [
  { key: "title", label: "Title" },
  { key: "description", label: "Description" },
  { key: "pricing", label: "Pay-per-event pricing" },
];
const activeStatuses = new Set(["QUEUED", "RUNNING", "APPLYING"]);
const resultProgress: Record<string, string> = {
  QUEUED: "Waiting to generate the proposal…",
  AUDITING: "Generating the proposal…",
  APPROVED: "Approved changes are queued for application.",
  APPLYING: "Applying approved fields to Apify…",
};
const REVIEW_PAGE_SIZE = 20;

function displayValue(state: ListingState, field: OptimizationField) {
  const value = state[field];
  return typeof value === "string" ? value : value ? JSON.stringify(value, null, 2) : "";
}

type DiffPart = { text: string; changed: boolean };

function changedParts(
  current: string,
  proposed: string,
): { current: DiffPart[]; proposed: DiffPart[] } {
  const oldWords = current.match(/\s+|[^\s]+/g) ?? [];
  const newWords = proposed.match(/\s+|[^\s]+/g) ?? [];
  if (oldWords.length * newWords.length <= 40_000) {
    const matrix = Array.from(
      { length: oldWords.length + 1 },
      () => new Uint16Array(newWords.length + 1),
    );
    for (let i = oldWords.length - 1; i >= 0; i--) {
      for (let j = newWords.length - 1; j >= 0; j--) {
        matrix[i][j] =
          oldWords[i] === newWords[j]
            ? matrix[i + 1][j + 1] + 1
            : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
      }
    }
    const oldParts: DiffPart[] = [];
    const newParts: DiffPart[] = [];
    let i = 0;
    let j = 0;
    while (i < oldWords.length && j < newWords.length) {
      if (oldWords[i] === newWords[j]) {
        oldParts.push({ text: oldWords[i++], changed: false });
        newParts.push({ text: newWords[j++], changed: false });
      } else if (matrix[i + 1][j] >= matrix[i][j + 1]) {
        oldParts.push({ text: oldWords[i++], changed: true });
      } else {
        newParts.push({ text: newWords[j++], changed: true });
      }
    }
    while (i < oldWords.length) oldParts.push({ text: oldWords[i++], changed: true });
    while (j < newWords.length) newParts.push({ text: newWords[j++], changed: true });
    return { current: oldParts, proposed: newParts };
  }
  // Large listing values use a bounded comparison to keep review responsive.
  let start = 0;
  while (start < current.length && start < proposed.length && current[start] === proposed[start])
    start++;
  let end = 0;
  while (
    end < current.length - start &&
    end < proposed.length - start &&
    current[current.length - 1 - end] === proposed[proposed.length - 1 - end]
  )
    end++;
  const split = (value: string): DiffPart[] => {
    const tail = end ? value.length - end : value.length;
    return [
      { text: value.slice(0, start), changed: false },
      { text: value.slice(start, tail), changed: true },
      { text: value.slice(tail), changed: false },
    ].filter((part) => part.text);
  };
  return { current: split(current), proposed: split(proposed) };
}

function ChangedValue({
  current,
  proposed,
  side,
}: {
  current: string;
  proposed: string;
  side: "current" | "proposed";
}) {
  const comparison = useMemo(() => changedParts(current, proposed), [current, proposed]);
  const value = side === "current" ? current : proposed;
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6">
      {value
        ? comparison[side].map((part, index) =>
            part.changed ? (
              <mark
                key={index}
                className={
                  side === "current"
                    ? "bg-destructive/15 text-foreground rounded-sm"
                    : "bg-signal-green/20 text-foreground rounded-sm"
                }
              >
                {part.text}
              </mark>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )
        : "Not provided"}
    </pre>
  );
}

function canApproveField(result: OptimizationResult, field: OptimizationField) {
  if (!result.proposedState) return false;
  if (field === "pricing") return Boolean(result.proposedState.pricing);
  return true;
}

function statusVariant(
  status: string,
): "success" | "warning" | "destructive" | "secondary" | "outline" {
  if (status === "APPLIED" || status === "READY_FOR_APPROVAL") return "success";
  if (status === "FAILED" || status === "APPLY_FAILED" || status === "STALE") return "destructive";
  if (status === "AUDITING" || status === "APPLYING" || status === "APPROVED") return "warning";
  return "secondary";
}

export function ActorOptimizationReview({ runId }: { runId: string }) {
  const [run, setRun] = useState<OptimizationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, OptimizationField[]>>({});
  const [approving, setApproving] = useState(false);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [resultPage, setResultPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/actors/optimization/runs/${encodeURIComponent(runId)}`,
        {
          cache: "no-store",
          credentials: "include",
        },
      );
      const body = (await response.json()) as {
        data?: OptimizationRun;
        error?: { message?: string };
      };
      if (!response.ok || !body.data)
        throw new Error(body.error?.message ?? "Could not load this audit");
      setRun(body.data);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this audit");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!run || !activeStatuses.has(run.status)) return;
    const timer = window.setInterval(() => void load(), 2_500);
    return () => window.clearInterval(timer);
  }, [load, run]);

  const approvalItems = useMemo(
    () =>
      (run?.results ?? []).flatMap((result) => {
        const selected = selection[result.id] ?? [];
        return result.status === "READY_FOR_APPROVAL" && selected.length > 0
          ? [{ resultId: result.id, fields: selected }]
          : [];
      }),
    [run, selection],
  );

  function toggleField(resultId: string, field: OptimizationField, checked: boolean) {
    setSelection((current) => {
      const selected = new Set(current[resultId] ?? []);
      if (checked) selected.add(field);
      else selected.delete(field);
      return { ...current, [resultId]: [...selected] };
    });
  }

  function toggleFieldForAll(field: OptimizationField, checked: boolean) {
    if (!run) return;
    const requested = new Set(run.requestedFields ?? fields.map(({ key }) => key));
    if (!requested.has(field)) return;

    setSelection((current) => {
      const next = { ...current };
      for (const result of run.results) {
        if (result.status !== "READY_FOR_APPROVAL" || !canApproveField(result, field)) continue;
        const selected = new Set(next[result.id] ?? []);
        if (checked) selected.add(field);
        else selected.delete(field);
        next[result.id] = [...selected];
      }
      return next;
    });
  }

  async function approveSelected() {
    if (approvalItems.length === 0) {
      toast.error("Select at least one proposed field to approve");
      return;
    }
    setApproving(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/actors/optimization/runs/${encodeURIComponent(runId)}/approve`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items: approvalItems }),
        },
      );
      const body = (await response.json()) as {
        data?: { queued: number; failed?: number };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "Could not approve these changes");
      if (!body.data || !Number.isInteger(body.data.queued) || body.data.queued < 0) {
        throw new Error("Could not confirm which changes were queued. Refresh this review.");
      }
      const { queued, failed = 0 } = body.data;
      if (queued > 0) void trackEvent("actor_optimization_approved", { queued_count: queued });
      if (failed > 0) {
        const failures = `${failed} Actor${failed === 1 ? "" : "s"} could not be queued.`;
        if (queued === 0) toast.error(`No changes were queued. ${failures}`);
        else toast.warning(`Changes queued for ${queued} Actor${queued === 1 ? "" : "s"}; ${failures}`);
      } else if (queued > 0) {
        toast.success("Approved changes are being applied to Apify");
      } else {
        toast.error("No changes were queued. Refresh this review.");
      }
      setReviewOpen(false);
      await load();
    } catch (approvalError) {
      toast.error(approvalError instanceof Error ? approvalError.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  async function recheck(resultId: string) {
    if (recheckingId !== null) return;
    setRecheckingId(resultId);
    try {
      const response = await fetch(
        `${API_BASE_URL}/actors/optimization/results/${encodeURIComponent(resultId)}/recheck`,
        { method: "POST", credentials: "include" },
      );
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Could not recheck this Actor");
      setSelection((current) => {
        const next = { ...current };
        delete next[resultId];
        return next;
      });
      toast.success("Actor recheck queued");
      await load();
    } catch (recheckError) {
      toast.error(recheckError instanceof Error ? recheckError.message : "Could not recheck this Actor");
    } finally {
      setRecheckingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error || !run) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">{error ?? "Audit not found"}</p>
          <Button className="mt-4" variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const progress =
    run.totalCount > 0
      ? Math.round(((run.completedCount + run.failedCount) / run.totalCount) * 100)
      : 0;
  const requested = new Set(run.requestedFields ?? fields.map(({ key }) => key));
  const bulkFields = fields.flatMap((field) => {
    if (!requested.has(field.key)) return [];
    const eligibleResults = run.results.filter(
      (result) => result.status === "READY_FOR_APPROVAL" && canApproveField(result, field.key),
    );
    if (eligibleResults.length === 0) return [];
    const selectedCount = eligibleResults.filter((result) =>
      (selection[result.id] ?? []).includes(field.key),
    ).length;
    return [{ ...field, eligibleResults, selectedCount }];
  });
  const resultPageCount = Math.max(1, Math.ceil(run.results.length / REVIEW_PAGE_SIZE));
  const safeResultPage = Math.min(resultPage, resultPageCount);
  const visibleResults = run.results.slice(
    (safeResultPage - 1) * REVIEW_PAGE_SIZE,
    safeResultPage * REVIEW_PAGE_SIZE,
  );
  const selectedFieldCount = approvalItems.reduce((count, item) => count + item.fields.length, 0);

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="Workspace / Actors / Improvements"
        title="Review Actor improvements"
        description="Review the proposed changes, select the fields you want, then confirm what will be sent to Apify."
        breadcrumbs={[
          { label: "Workspace", href: "/dashboard" },
          { label: "Actors", href: "/dashboard/actors" },
          { label: "Improvements" },
        ]}
        status={
          <div className="flex items-center gap-2">
            <Badge variant="outline">{run.kind.replaceAll("_", " ")}</Badge>
            <Badge variant={statusVariant(run.status)}>{run.status.replaceAll("_", " ")}</Badge>
          </div>
        }
        secondaryActions={[
          {
            label: "Improvement history",
            href: "/dashboard/actors/improvements",
            icon: <ArrowLeft className="h-3.5 w-3.5" />,
          },
          {
            label: "Refresh review",
            icon: <RefreshCw className="h-3.5 w-3.5" />,
            onSelect: () => void load(),
          },
        ]}
      />

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between text-sm">
            <span>
              {run.completedCount + run.failedCount} of {run.totalCount} audited
            </span>
            <span>{progress}%</span>
          </div>
          <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
            <div className="bg-primary h-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            Generating proposals does not change Apify. No fields are selected until you choose
            them.
          </p>
        </CardContent>
      </Card>

      {bulkFields.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Bulk field selection</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Select a field once to include it for every eligible Actor in this review.
              </p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <ListChecks className="mr-2 h-4 w-4" />
                  Select fields across Actors
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Select fields across Actors</DialogTitle>
                  <DialogDescription>
                    Checked fields will be selected for every eligible Actor. You can still adjust
                    any Actor individually after closing this dialog.
                  </DialogDescription>
                </DialogHeader>

                <div className="divide-border overflow-hidden rounded-md border">
                  {bulkFields.map(({ key, label, eligibleResults, selectedCount }) => {
                    const allSelected = selectedCount === eligibleResults.length;
                    const partiallySelected = selectedCount > 0 && !allSelected;
                    return (
                      <label
                        key={key}
                        className="hover:bg-muted/30 flex cursor-pointer items-center gap-3 border-b px-4 py-3 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(node) => {
                            if (node) node.indeterminate = partiallySelected;
                          }}
                          onChange={(event) => toggleFieldForAll(key, event.target.checked)}
                          aria-label={`Select ${label} for all eligible Actors`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{label}</span>
                          <span className="text-muted-foreground block text-xs">
                            {selectedCount} of {eligibleResults.length} eligible Actor
                            {eligibleResults.length === 1 ? "" : "s"} selected
                          </span>
                        </span>
                        {allSelected ? <Badge variant="success">All selected</Badge> : null}
                        {partiallySelected ? <Badge variant="warning">Some selected</Badge> : null}
                      </label>
                    );
                  })}
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => bulkFields.forEach(({ key }) => toggleFieldForAll(key, false))}
                  >
                    Clear all
                  </Button>
                  <Button
                    onClick={() => bulkFields.forEach(({ key }) => toggleFieldForAll(key, true))}
                  >
                    Select all fields
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      ) : null}

      {run.results.length > REVIEW_PAGE_SIZE ? (
        <div className="border-border/60 bg-card flex flex-col gap-3 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Showing {(safeResultPage - 1) * REVIEW_PAGE_SIZE + 1}–
            {Math.min(safeResultPage * REVIEW_PAGE_SIZE, run.results.length)} of{" "}
            {run.results.length} Actor proposals. Bulk field selection applies to all eligible
            Actors.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safeResultPage === 1}
              onClick={() => setResultPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="min-w-20 text-center text-sm">
              {safeResultPage} / {resultPageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safeResultPage === resultPageCount}
              onClick={() => setResultPage((current) => Math.min(resultPageCount, current + 1))}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {visibleResults.map((result) => {
        const ready =
          result.status === "READY_FOR_APPROVAL" && result.currentState && result.proposedState;
        return (
          <Card key={result.id}>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
              <div>
                <CardTitle className="text-lg">
                  {result.actor.title ?? result.actor.actorName}
                </CardTitle>
                <p className="text-muted-foreground mt-1 text-xs">
                  {result.actor.username}/{result.actor.actorName}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {result.currentScore != null ? (
                  <Badge variant="outline">
                    {result.currentScore}% → {result.proposedScore}%
                  </Badge>
                ) : null}
                {result.improvementPoints != null && result.improvementPoints > 0 ? (
                  <Badge variant="success">
                    +{result.improvementPoints} points · {result.improvementPercent}% relative
                  </Badge>
                ) : null}
                <Badge variant={statusVariant(result.status)}>
                  {result.status.replaceAll("_", " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {result.issues?.summary ? (
                <p className="text-muted-foreground text-sm">{result.issues.summary}</p>
              ) : null}
              {ready && result.currentState && result.proposedState ? (
                <div className="space-y-4">
                  {fields
                    .filter(
                      ({ key }) =>
                        (run.requestedFields ?? fields.map(({ key: field }) => field)).includes(
                          key,
                        ) && canApproveField(result, key),
                    )
                    .map(({ key, label }) => {
                      const checked = (selection[result.id] ?? []).includes(key);
                      const currentValue = displayValue(result.currentState!, key);
                      const proposedValue = displayValue(result.proposedState!, key);
                      return (
                        <section
                          key={key}
                          className="border-border/60 overflow-hidden rounded-md border"
                        >
                          <div className="bg-muted/30 flex items-center justify-between border-b px-4 py-3">
                            <h3 className="font-medium">{label}</h3>
                            <label className="flex items-center gap-2 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) =>
                                  toggleField(result.id, key, event.target.checked)
                                }
                              />
                              Include this change
                            </label>
                          </div>
                          <div className="grid md:grid-cols-2">
                            <div className="border-border/60 p-4 md:border-r">
                              <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                                Current
                              </p>
                              <ChangedValue
                                current={currentValue}
                                proposed={proposedValue}
                                side="current"
                              />
                            </div>
                            <div className="bg-emerald-500/[0.04] p-4">
                              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                                Proposed
                              </p>
                              <ChangedValue
                                current={currentValue}
                                proposed={proposedValue}
                                side="proposed"
                              />
                            </div>
                          </div>
                        </section>
                      );
                    })}
                </div>
              ) : result.error ? (
                <div className="border-destructive/30 bg-destructive/5 rounded-md border p-4 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
                    <p>{result.error}</p>
                  </div>
                  {["FAILED", "STALE", "APPLY_FAILED"].includes(result.status) ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={recheckingId !== null} onClick={() => void recheck(result.id)}>
                        {recheckingId === result.id ? "Queuing recheck…" : "Recheck Actor"}
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link
                          href={`/dashboard/support/new?from=optimization&actorId=${encodeURIComponent(result.actor.id)}`}
                        >
                          Ask support
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : resultProgress[result.status] ? (
                <div role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {resultProgress[result.status]}
                </div>
              ) : null}
              {result.status === "APPLIED" ? (
                <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Approved fields were applied to Apify.
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}

      {approvalItems.length > 0 ? (
        <div className="border-border bg-background sticky bottom-4 z-30 flex flex-col gap-3 rounded-lg border p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Changes selected</p>
            <p className="text-muted-foreground text-xs">
              {selectedFieldCount} field{selectedFieldCount === 1 ? "" : "s"} across{" "}
              {approvalItems.length} Actor{approvalItems.length === 1 ? "" : "s"}.
            </p>
          </div>
          <Button onClick={() => setReviewOpen(true)} disabled={approving}>
            Review selected changes
          </Button>
        </div>
      ) : null}
      <Dialog open={reviewOpen} onOpenChange={(open) => !approving && setReviewOpen(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Confirm Apify changes</DialogTitle>
            <DialogDescription>
              The selected fields below will be applied to the listed Actors in Apify. Review the
              selection before continuing.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 divide-y overflow-y-auto rounded-md border" role="list">
            {approvalItems.map((item) => {
              const result = run.results.find((entry) => entry.id === item.resultId);
              if (!result) return null;
              return (
                <div key={item.resultId} className="px-4 py-3" role="listitem">
                  <p className="text-sm font-semibold">
                    {result.actor.title ?? result.actor.actorName}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {item.fields
                      .map((field) => fields.find((entry) => entry.key === field)?.label ?? field)
                      .join(", ")}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-muted-foreground text-xs">
            {selectedFieldCount} selected field{selectedFieldCount === 1 ? "" : "s"} across{" "}
            {approvalItems.length} Actor{approvalItems.length === 1 ? "" : "s"}.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={approving}>
              Back to review
            </Button>
            <Button
              onClick={() => void approveSelected()}
              disabled={approving || approvalItems.length === 0}
            >
              {approving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Apply to Apify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
