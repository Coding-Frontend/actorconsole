import { API_BASE_URL } from "@/lib/api-base";

export type LogoReviewStatus = "PENDING" | "APPLIED" | "DISMISSED";
export type LogoReviewAction = "apply" | "dismiss";
export type LogoReviewFilters = {
  status: LogoReviewStatus;
  query: string;
  websiteId: string;
  thumbnail: "all" | "missing" | "existing";
};
export type LogoReviewSelection = {
  id: string;
  actor: { id: string; actorName: string; title: string | null };
};
export type LogoReviewItem = LogoReviewSelection & {
  status: LogoReviewStatus;
  error: string | null;
  appliedAt: string | null;
  dismissedAt: string | null;
  proposedImageUrl: string;
  actor: LogoReviewSelection["actor"] & {
    apifyActorId: string;
    username: string;
    currentImageUrl: string | null;
  };
  logo: { websiteIdentity: { id: string; name: string; canonicalDomain: string | null } };
};
export type LogoReviewPage = {
  items: LogoReviewItem[];
  total: number;
  page: number;
  limit: number;
  workspaceId: string;
  summary: {
    counts: Record<LogoReviewStatus, number>;
    websites: Array<{ id: string; name: string; canonicalDomain: string | null }>;
  };
};
export type LogoReviewResult = LogoReviewSelection & {
  outcome: "applied" | "dismissed" | "failed";
  message?: string;
  retryable: boolean;
};

export class LogoReviewRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function logoReviewParams(filters: LogoReviewFilters) {
  const params = new URLSearchParams({ status: filters.status });
  if (filters.query) params.set("q", filters.query);
  if (filters.websiteId) params.set("websiteId", filters.websiteId);
  if (filters.thumbnail !== "all") params.set("thumbnail", filters.thumbnail);
  return params;
}

export async function logoReviewRequest<T>(
  path: string,
  { workspaceId, ...init }: RequestInit & { workspaceId?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (workspaceId) headers.set("x-business-profile-id", workspaceId);
  const response = await fetch(`${API_BASE_URL}/actors/logo-recommendations${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: T;
    error?: { message?: string; code?: string };
  } | null;
  if (!response.ok || body?.ok === false || body?.data === undefined) {
    throw new LogoReviewRequestError(
      body?.error?.message ?? "Could not complete the logo request. Please refresh and try again.",
      response.ok && body?.data === undefined ? 0 : response.status,
      body?.error?.code,
    );
  }
  return body.data;
}

export async function selectAllLogoReviews(
  filters: LogoReviewFilters,
  workspaceId: string,
  signal: AbortSignal,
): Promise<LogoReviewSelection[]> {
  const selected = new Map<string, LogoReviewSelection>();
  let after: string | null = null;
  do {
    signal.throwIfAborted();
    const params = logoReviewParams(filters);
    if (after) params.set("after", after);
    const response: {
      items: LogoReviewSelection[];
      nextCursor: string | null;
      workspaceId: string;
    } = await logoReviewRequest(`/selection?${params}`, { workspaceId, signal });
    if (response.workspaceId !== workspaceId)
      throw new Error("The workspace changed. Refresh before selecting Actors.");
    for (const item of response.items) selected.set(item.id, item);
    if (response.nextCursor && response.nextCursor === after)
      throw new Error("Could not finish selecting Actors. Please refresh and try again.");
    after = response.nextCursor;
  } while (after);
  return [...selected.values()];
}

export type LogoApplyBatchView = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "STOPPED" | "FAILED";
  total: number;
  stopRequested: boolean;
  error: string | null;
  workspaceId: string;
  items: Array<
    LogoReviewSelection & {
      outcome: "applied" | "queued" | "running" | "failed";
      message?: string;
      retryable: boolean;
    }
  >;
};

/** Poll interval for following a background batch (adjustable in tests). */
export const logoReviewTiming = { pollMs: 2_500 };
const DISMISS_CHUNK = 500;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function activeLogoApplyBatch(workspaceId: string, signal?: AbortSignal) {
  return logoReviewRequest<{ batch: LogoApplyBatchView | null; workspaceId: string }>(
    "/batches/active",
    { workspaceId, signal },
  );
}

function batchResults(view: LogoApplyBatchView) {
  const results: LogoReviewResult[] = [];
  for (const item of view.items ?? []) {
    if (item.outcome === "queued" || item.outcome === "running") continue;
    results.push({
      id: item.id,
      actor: item.actor,
      outcome: item.outcome === "applied" ? "applied" : "failed",
      ...(item.message ? { message: item.message } : {}),
      retryable: item.outcome === "failed" && item.retryable,
    });
  }
  return results;
}

/**
 * Apply runs as a background batch on the server: it keeps going if the page
 * closes, and leaving only stops this view from following it. Dismiss is a
 * database-only change sent in a few requests. Completed decisions remain
 * saved if the user stops or leaves the page.
 */
export async function runLogoReviewBatch({
  action,
  items,
  workspaceId,
  signal,
  shouldStop,
  onProgress,
  resumeBatchId,
}: {
  action: LogoReviewAction;
  items: LogoReviewSelection[];
  workspaceId: string;
  signal: AbortSignal;
  shouldStop: () => boolean;
  onProgress: (current: LogoReviewSelection | null, results: LogoReviewResult[], total?: number) => void;
  resumeBatchId?: string;
}) {
  if (action === "dismiss") return runDismissBatch({ items, workspaceId, signal, shouldStop, onProgress });

  let view: LogoApplyBatchView;
  try {
    view = resumeBatchId
      ? await logoReviewRequest<LogoApplyBatchView>(`/batches/${encodeURIComponent(resumeBatchId)}`, {
          workspaceId,
          signal,
        })
      : await logoReviewRequest<LogoApplyBatchView>("/batches", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: items.map((item) => item.id) }),
          workspaceId,
          signal,
        });
  } catch (error) {
    if (signal.aborted) return [];
    const known = error instanceof LogoReviewRequestError;
    const message =
      known && error.status !== 0
        ? error.message
        : "Could not start the logo updates. Refresh to check these Actors before trying again.";
    return items.map((item) => ({
      ...item,
      outcome: "failed" as const,
      message,
      retryable: known && error.status !== 0 && error.code !== "logo_recommendation_superseded",
    }));
  }

  // A reply that arrives after the page moved on (workspace change, unmount) is ignored.
  if (signal.aborted) return [];
  let stopSent = false;
  for (;;) {
    const running = (view.items ?? []).find((item) => item.outcome === "running");
    onProgress(running ? { id: running.id, actor: running.actor } : null, batchResults(view), view.total);
    if (!["QUEUED", "RUNNING"].includes(view.status)) break;
    if (shouldStop() && !stopSent) {
      stopSent = true;
      try {
        view = await logoReviewRequest<LogoApplyBatchView>(
          `/batches/${encodeURIComponent(view.id)}/stop`,
          { method: "POST", workspaceId, signal },
        );
        continue;
      } catch {
        if (signal.aborted) break;
      }
    }
    await wait(logoReviewTiming.pollMs, signal);
    if (signal.aborted) break;
    try {
      view = await logoReviewRequest<LogoApplyBatchView>(`/batches/${encodeURIComponent(view.id)}`, {
        workspaceId,
        signal,
      });
    } catch {
      // A missed poll is harmless: the batch keeps running on the server.
      if (signal.aborted) break;
    }
  }
  return batchResults(view);
}

async function runDismissBatch({
  items,
  workspaceId,
  signal,
  shouldStop,
  onProgress,
}: {
  items: LogoReviewSelection[];
  workspaceId: string;
  signal: AbortSignal;
  shouldStop: () => boolean;
  onProgress: (current: LogoReviewSelection | null, results: LogoReviewResult[]) => void;
}) {
  const results: LogoReviewResult[] = [];
  for (let offset = 0; offset < items.length; offset += DISMISS_CHUNK) {
    if (signal.aborted || shouldStop()) break;
    const chunk = items.slice(offset, offset + DISMISS_CHUNK);
    onProgress(chunk[0] ?? null, [...results]);
    try {
      const { dismissed } = await logoReviewRequest<{ dismissed: string[] }>("/dismiss", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: chunk.map((item) => item.id) }),
        workspaceId,
        signal,
      });
      if (signal.aborted) break;
      const done = new Set(dismissed);
      for (const item of chunk) {
        results.push(
          done.has(item.id)
            ? { ...item, outcome: "dismissed", retryable: false }
            : {
                ...item,
                outcome: "failed",
                message: "This recommendation is no longer waiting for review.",
                retryable: false,
              },
        );
      }
    } catch (error) {
      if (signal.aborted) break;
      const known = error instanceof LogoReviewRequestError;
      for (const item of chunk) {
        results.push({
          ...item,
          outcome: "failed",
          message:
            known && error.status !== 0
              ? error.message
              : "Could not confirm this update. Refresh to check this Actor before trying again.",
          retryable: known && error.status !== 0 && error.status !== 404,
        });
      }
      onProgress(null, [...results]);
      break;
    }
    onProgress(null, [...results]);
  }
  return results;
}
