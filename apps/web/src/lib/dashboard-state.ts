/**
 * Response metadata shared by dashboard data loaders.
 *
 * The payload itself stays backward compatible (callers can continue reading
 * `body.data`), while this metadata gives every page the same vocabulary for
 * cached-first rendering, background refreshes, and rate-limit recovery.
 */
export interface DashboardResponseMeta {
  cached?: boolean;
  stale?: boolean;
  syncedAt?: string | null;
  requestId?: string | null;
  retryAfterSeconds?: number | null;
}

export interface DashboardResponse<T> {
  ok: boolean;
  data: T;
  meta?: DashboardResponseMeta;
  error?: {
    code?: string;
    message?: string;
    requestId?: string | null;
    retryAfterSeconds?: number | null;
  };
}
