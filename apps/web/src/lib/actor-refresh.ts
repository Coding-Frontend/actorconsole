import { API_BASE_URL } from "@/lib/api-base";

export const WORKSPACE_DATA_REFRESHED_EVENT = "actorconsole:workspace-data-refreshed";

type RefreshState = "completed" | "failed" | "unknown";

export async function refreshWorkspaceActors(
  options: {
    signal?: AbortSignal;
    onQueued?: () => void;
    onCompleted?: () => void;
  } = {},
): Promise<RefreshState> {
  const response = await fetch(`${API_BASE_URL}/actors/refresh`, {
    method: "POST",
    credentials: "include",
    signal: options.signal,
  });
  if (!response.ok) return "unknown";
  const body = (await response.json().catch(() => null)) as { data?: { jobId?: string } } | null;
  const jobId = body?.data?.jobId;
  if (!jobId) return "unknown";
  options.onQueued?.();

  const deadline = Date.now() + 60_000;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    options.signal?.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) return "unknown";
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
    if (!statusResponse.ok) continue;
    const statusBody = (await statusResponse.json().catch(() => null)) as {
      data?: { state?: string };
    } | null;
    if (statusBody?.data?.state === "completed") {
      window.dispatchEvent(new CustomEvent(WORKSPACE_DATA_REFRESHED_EVENT));
      options.onCompleted?.();
      return "completed";
    }
    if (statusBody?.data?.state === "failed") return "failed";
  }
  return "unknown";
}
