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

/** Use the same verified per-Actor endpoint as individual reviews. Never retry
 * a potentially accepted external mutation automatically. Completed decisions
 * remain saved if the user stops or leaves the page. */
export async function runLogoReviewBatch({
  action,
  items,
  workspaceId,
  signal,
  shouldStop,
  onProgress,
}: {
  action: LogoReviewAction;
  items: LogoReviewSelection[];
  workspaceId: string;
  signal: AbortSignal;
  shouldStop: () => boolean;
  onProgress: (current: LogoReviewSelection | null, results: LogoReviewResult[]) => void;
}) {
  const results: LogoReviewResult[] = [];
  for (const item of items) {
    if (signal.aborted || shouldStop()) break;
    onProgress(item, [...results]);
    let stop = false;
    try {
      await logoReviewRequest(`/${encodeURIComponent(item.id)}/${action}`, {
        method: "POST",
        workspaceId,
        signal,
      });
      if (signal.aborted) break;
      results.push({
        ...item,
        outcome: action === "apply" ? "applied" : "dismissed",
        retryable: false,
      });
    } catch (error) {
      if (signal.aborted) break;
      const known = error instanceof LogoReviewRequestError;
      stop =
        !known ||
        [0, 401, 403, 429].includes(error.status) ||
        error.code === "apify_publishing_credentials_required";
      results.push({
        ...item,
        outcome: "failed",
        message:
          known && error.status !== 0
            ? error.message
            : "Could not confirm this update. Refresh to check this Actor before trying again.",
        retryable:
          known &&
          error.status !== 0 &&
          error.status !== 404 &&
          error.code !== "logo_recommendation_superseded",
      });
    }
    onProgress(null, [...results]);
    if (stop) break;
  }
  return results;
}
