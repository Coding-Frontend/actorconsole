import "server-only";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { SERVER_API_BASE_URL } from "@/lib/api-base";

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_READ_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 4_000;
// A server component must never hold an entire dashboard render open while a
// downstream API, database pool, or network socket is unhealthy. The browser
// proxy already has a deadline; keep the direct server-to-API path bounded as
// well because dashboard pages use it during the initial render.
const SERVER_FETCH_TIMEOUT_MS = 12_000;
// Portfolio financial reports aggregate up to two years of daily records for
// hundreds of Actors. Match the browser proxy's bounded budget for these reads
// so valid VPS responses are not aborted halfway through a large report.
const FINANCIAL_FETCH_TIMEOUT_MS = 30_000;

function retryDelayMs(attempt: number, response: Response) {
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, seconds * 1_000));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, date - Date.now()));
  }
  const exponential = Math.min(MAX_RETRY_DELAY_MS, 250 * 2 ** attempt);
  return Math.round(exponential * (0.8 + Math.random() * 0.4));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls the API from a server component while preserving the browser's
 * backend session cookie. `credentials: "include"` alone has no effect in a
 * server-side fetch.
 */
export async function authenticatedServerFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!path.startsWith("/")) {
    throw new Error("Server API paths must start with '/'");
  }

  const incomingHeaders = await headers();
  const cookie = incomingHeaders.get("cookie");
  const outgoingHeaders = new Headers(init.headers);
  if (cookie) outgoingHeaders.set("cookie", cookie);
  outgoingHeaders.set("x-request-id", incomingHeaders.get("x-request-id") ?? randomUUID());

  const requestInit: RequestInit = {
    ...init,
    headers: outgoingHeaders,
    cache: "no-store",
  };
  const method = (requestInit.method ?? "GET").toUpperCase();
  const financialRead =
    method === "GET" &&
    (/^\/actors\/(usage|costs|revenue|usage-costs)(\?|$)/.test(path) ||
      /^\/account\/default-dashboard(\?|$)/.test(path));
  const timeoutSignal = AbortSignal.timeout(
    financialRead ? FINANCIAL_FETCH_TIMEOUT_MS : SERVER_FETCH_TIMEOUT_MS,
  );
  requestInit.signal = requestInit.signal
    ? AbortSignal.any([requestInit.signal, timeoutSignal])
    : timeoutSignal;
  const retryableRead = method === "GET" || method === "HEAD" || method === "OPTIONS";

  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < (retryableRead ? MAX_READ_ATTEMPTS : 1); attempt += 1) {
    const response = await fetch(`${SERVER_API_BASE_URL}${path}`, requestInit);
    lastResponse = response;
    if (
      !retryableRead ||
      !RETRYABLE_STATUSES.has(response.status) ||
      attempt === MAX_READ_ATTEMPTS - 1
    ) {
      return response;
    }
    await sleep(retryDelayMs(attempt, response));
  }

  // The loop always makes at least one request; this keeps TypeScript's
  // control-flow analysis explicit if the retry policy changes in the future.
  return lastResponse!;
}
