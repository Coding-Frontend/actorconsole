/**
 * Typed error surface for the apify-client wrapper.
 *
 * - 404 (actor not found, store item missing) maps to `not_found`.
 * - 401 (token rejected) maps to `unauthorized`.
 * - 403 (forbidden, e.g. private actor without read perms) maps to `forbidden`.
 * - 429 (rate limit) maps to `rate_limited` after the shared retry policy is exhausted.
 * - 4xx/5xx other than above maps to `unknown`; network failures map to `network`.
 *
 * Callers catch `ApifyClientError` and pattern-match on `err.code`.
 */

export type ApifyErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "daily_publication_limit"
  | "validation"
  | "network"
  | "unknown";

export class ApifyClientError extends Error {
  readonly code: ApifyErrorCode;
  readonly status: number | null;
  override readonly cause?: unknown;

  constructor(
    code: ApifyErrorCode,
    message: string,
    opts?: { status?: number | null; cause?: unknown },
  ) {
    super(message);
    this.name = "ApifyClientError";
    this.code = code;
    this.status = opts?.status ?? null;
    this.cause = opts?.cause;
  }
}

/** Map any thrown error into an ApifyClientError. Handles both ApifyApiError-shape and fetch/network failures. */
export function toApifyClientError(err: unknown): ApifyClientError {
  if (err instanceof ApifyClientError) return err;
  // The apify-client SDK throws objects shaped like { statusCode, type, message }.
  if (typeof err === "object" && err !== null) {
    const e = err as {
      statusCode?: number;
      type?: string;
      errorCode?: string;
      message?: string;
      name?: string;
    };
    const status = typeof e.statusCode === "number" ? e.statusCode : null;
    const code = mapStatusToCode(status, e.type ?? e.errorCode);
    const message = e.message || `Apify call failed (${code})`;
    return new ApifyClientError(code, message, { status, cause: err });
  }
  return new ApifyClientError("unknown", "Apify call failed", { cause: err });
}

export function mapStatusToCode(status: number | null, type?: string): ApifyErrorCode {
  if (type === "daily-publication-limit-exceeded") return "daily_publication_limit";
  if (type === "rate-limited" || status === 429) return "rate_limited";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "validation";
  if (status === null || status === undefined) return "network";
  if (status >= 500) return "unknown";
  return "unknown";
}
