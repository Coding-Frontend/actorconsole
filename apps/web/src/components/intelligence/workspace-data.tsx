"use client";
import type { ActorEarnings, EarningsRollup } from "@actorconsole/shared/actor-earnings";
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { DashboardAsyncState } from "@/components/dashboard/dashboard-workbench";

export interface WorkspaceEarningsData {
  summary: EarningsRollup;
  users30Days: number;
  reportedUserActors: number;
  items: {
    id: string;
    title: string | null;
    actorName: string;
    username: string;
    users30Days: number | null;
    runs30Days: number | null;
    lastSeenAt: string | null;
    earnings: ActorEarnings;
  }[];
}

export async function intelligenceRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/intelligence${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const result = await response.json();
  if (!response.ok || result.ok === false)
    throw new Error(result.error?.message ?? "Workspace data could not be loaded. Try again.");
  return result.data as T;
}
export function useIntelligence<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!path);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    window.addEventListener("actorconsole:workspace-changed", refresh);
    window.addEventListener("actorconsole:workspace-data-refreshed", refresh);
    return () => {
      window.removeEventListener("actorconsole:workspace-changed", refresh);
      window.removeEventListener("actorconsole:workspace-data-refreshed", refresh);
    };
  }, [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    setLoading(!!path);
    if (path)
      intelligenceRequest<T>(path, "GET", undefined, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setData(data);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setError(error instanceof Error ? error.message : "Data could not load.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    return () => controller.abort();
  }, [path, revision]);
  return { data, loading, error, refresh };
}
export function WorkspaceState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (loading)
    return (
      <DashboardAsyncState
        status="loading"
        title="Loading Actor intelligence"
        description="Fetching data for the selected workspace."
      />
    );
  if (error)
    return (
      <DashboardAsyncState
        status="error"
        title="Workspace data could not load"
        description={error}
        onRetry={retry}
      />
    );
  return null;
}
export const fieldClass =
  "h-10 w-full rounded-sm border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export interface IntelligenceActor {
  id: string;
  actorName: string;
  title: string | null;
  apifyActorId: string;
}
export function PagePagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  return (
    <nav
      aria-label="Result pages"
      className="flex flex-wrap items-center justify-between gap-3 py-4"
    >
      <Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span className="text-muted-foreground text-sm">
        Page {page} of {Math.ceil(total / pageSize)}
      </span>
      <Button
        variant="outline"
        disabled={page * pageSize >= total}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
