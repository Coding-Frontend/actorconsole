"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, History, Loader2, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-base";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type RunResult = {
  id: string;
  status: string;
  currentScore: number | null;
  proposedScore: number | null;
  actor: { id: string; title: string | null; actorName: string; username: string };
};

type ImprovementRun = {
  id: string;
  kind: string;
  requestedFields: string[] | null;
  status: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  appliedCount: number;
  createdAt: string;
  results: RunResult[];
};

function formatKind(kind: string) {
  return kind
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

function statusVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
  if (status === "APPLIED" || status === "READY_FOR_APPROVAL") return "success";
  if (status === "FAILED" || status === "PARTIALLY_APPLIED") return "destructive";
  if (["QUEUED", "RUNNING", "APPLYING"].includes(status)) return "warning";
  return "secondary";
}

export function ActorImprovementHistory() {
  const [runs, setRuns] = useState<ImprovementRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (kind !== "all") params.set("kind", kind);
      const response = await fetch(`${API_BASE_URL}/actors/optimization/runs?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = (await response.json()) as {
        data?: { items?: ImprovementRun[] };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "Could not load improvements");
      setRuns(body.data?.items ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load improvements");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="text-muted-foreground text-xs">
          <span className="sr-only">Filter generation type</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm"
          >
            <option value="all">All generations</option>
            <option value="GENERATE_IMPROVEMENTS">All improvements</option>
            <option value="CUSTOM">Custom bulk runs</option>
            <option value="REWRITE_COPY">Copy rewrites</option>
            <option value="UPDATE_PRICING">Pay-per-event pricing</option>
          </select>
        </label>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="text-destructive p-5 text-sm">{error}</CardContent>
        </Card>
      ) : loading && runs.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading generation history…
          </CardContent>
        </Card>
      ) : runs.length === 0 ? (
        <EmptyState
          title="No improvement generations yet"
          description="Select Actors and generate improvements, or start a focused action from an Actor details page."
          action={{ label: "Open Actors", href: "/dashboard/actors" }}
        />
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Card key={run.id} variant="hover">
              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <History className="text-signal-orange h-4 w-4" />
                    {formatKind(run.kind)}
                    <Badge variant={statusVariant(run.status)}>
                      {run.status.replaceAll("_", " ")}
                    </Badge>
                  </CardTitle>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(run.createdAt))}
                    {" · "}
                    {run.totalCount} Actor{run.totalCount === 1 ? "" : "s"}
                    {" · "}
                    {run.completedCount} generated{" · "}
                    {run.appliedCount} applied
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link href={`/dashboard/actors/optimization/${run.id}`}>
                    Open run <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {run.requestedFields?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {run.requestedFields.map((field) => (
                      <Badge key={field} variant="outline">
                        {formatKind(field)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {run.results.slice(0, 6).map((result) => (
                    <div
                      key={result.id}
                      className="border-border/60 bg-muted/20 rounded-md border px-3 py-2 text-sm"
                    >
                      <p className="truncate font-medium">
                        {result.actor.title ?? result.actor.actorName}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {result.actor.username}/{result.actor.actorName} ·{" "}
                        {result.status.replaceAll("_", " ").toLowerCase()}
                      </p>
                    </div>
                  ))}
                </div>
                {run.results.length > 6 ? (
                  <p className="text-muted-foreground text-xs">
                    +{run.results.length - 6} more Actors
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
