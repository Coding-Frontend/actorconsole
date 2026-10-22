const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
function pause(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    }, ms);
    signal.addEventListener("abort", aborted, { once: true });
  });
}
/** Bounded retries for reads only. Never replay a mutation or retain an identity. */
export async function fetchRead(input: string, init: RequestInit = {}, timeoutMs = 12_000) {
  const budget = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, budget]) : budget;
  const read = ["GET", "HEAD"].includes((init.method ?? "GET").toUpperCase());
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(input, { ...init, signal });
    } catch (error) {
      if (!read || attempt >= 2 || signal.aborted || !(error instanceof TypeError)) throw error;
      await pause(150 * 2 ** attempt, signal);
      continue;
    }
    if (!read || attempt >= 2 || !retryableStatuses.has(response.status)) return response;
    const seconds = Number(response.headers.get("retry-after"));
    if (response.status === 429 && Number.isFinite(seconds) && seconds > 2) return response;
    const delay = seconds > 0 ? Math.min(2_000, seconds * 1_000) : 150 * 2 ** attempt;
    await response.body?.cancel().catch(() => undefined);
    await pause(delay, signal);
  }
}
