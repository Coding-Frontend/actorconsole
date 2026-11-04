import { API_BASE_URL } from "@/lib/api-base";

export const WORKSPACE_DATA_REFRESHED_EVENT = "actorconsole:workspace-data-refreshed";
export const ACTOR_REFRESH_PROGRESS_EVENT = "actorconsole:actor-refresh-progress";

type RefreshState = "completed" | "failed" | "pending" | "unknown";
export interface ActorRefreshProgress {
  jobId: string;
  state: string;
  progress?: { completed?: number; total?: number };
  startedAt: number;
}
const storageKey = (workspaceId: string) => `actorconsole:actor-refresh-job:${workspaceId}`;
export function pendingActorRefresh(workspaceId?: string | null): ActorRefreshProgress | null {
  if (!workspaceId || typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(workspaceId)) ?? "null");
    return typeof saved?.jobId === "string" &&
      saved.jobId &&
      typeof saved.startedAt === "number" &&
      Date.now() - saved.startedAt < 86400000
      ? saved
      : null;
  } catch {
    return null;
  }
}

function progress(workspaceId: string | undefined, value: ActorRefreshProgress) {
  if (typeof window === "undefined") return;
  if (workspaceId) {
    try {
      if (["completed", "failed"].includes(value.state))
        window.localStorage.removeItem(storageKey(workspaceId));
      else window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(value));
    } catch {
      /* The active page can still track progress without local storage. */
    }
  }
  window.dispatchEvent(
    new CustomEvent(ACTOR_REFRESH_PROGRESS_EVENT, { detail: { workspaceId, ...value } }),
  );
}

export async function refreshWorkspaceActors(
  options: {
    signal?: AbortSignal;
    workspaceId?: string;
    onQueued?: (jobId?: string) => void;
    onProgress?: (progress: ActorRefreshProgress) => void;
    onCompleted?: () => void;
  } = {},
): Promise<RefreshState> {
  let saved = pendingActorRefresh(options.workspaceId);
  if (!saved) {
    const response = await fetch(`${API_BASE_URL}/actors/refresh`, {
      method: "POST",
      credentials: "include",
      signal: options.signal,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error?.message ?? "Could not start the Actor refresh");
    }
    const body = (await response.json().catch(() => null)) as { data?: { jobId?: string } } | null;
    const jobId = body?.data?.jobId;
    if (!jobId) return "unknown";
    saved = { jobId, state: "queued", startedAt: Date.now() };
  }
  const jobId = saved.jobId;
  options.signal?.throwIfAborted();
  progress(options.workspaceId, saved);
  options.onQueued?.(jobId);

  const deadline = Date.now() + 60_000;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    options.signal?.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) return "pending";
    // Keep fast jobs responsive, then back off for queued/long-running jobs.
    // This bounds an automatic loop to roughly 13 polls instead of 40/minute.
    const delay = Math.min(1_500 * 2 ** Math.floor(attempt / 3), 10_000, remaining);
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        window.clearTimeout(timeout);
        reject(options.signal?.reason ?? new DOMException("Aborted", "AbortError"));
      };
      const timeout = window.setTimeout(() => {
        options.signal?.removeEventListener("abort", onAbort);
        resolve();
      }, delay);
      options.signal?.addEventListener("abort", onAbort, { once: true });
    });
    const statusResponse = await fetch(
      `${API_BASE_URL}/actors/refresh/${encodeURIComponent(jobId)}`,
      { credentials: "include", cache: "no-store", signal: options.signal },
    );
    options.signal?.throwIfAborted();
    if (statusResponse.status === 404) {
      progress(options.workspaceId, { ...saved, state: "failed" });
      return "failed";
    }
    if (!statusResponse.ok) continue;
    const statusBody = (await statusResponse.json().catch(() => null)) as {
      data?: { state?: string; progress?: { completed?: number; total?: number } };
    } | null;
    options.signal?.throwIfAborted();
    const latest = {
      ...saved,
      state: statusBody?.data?.state ?? saved.state,
      progress: statusBody?.data?.progress,
    };
    progress(options.workspaceId, latest);
    options.onProgress?.(latest);
    if (statusBody?.data?.state === "completed") {
      window.dispatchEvent(
        new CustomEvent(WORKSPACE_DATA_REFRESHED_EVENT, {
          detail: { workspaceId: options.workspaceId },
        }),
      );
      options.onCompleted?.();
      return "completed";
    }
    if (statusBody?.data?.state === "failed") return "failed";
  }
  return "pending";
}
