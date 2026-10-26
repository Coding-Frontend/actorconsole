/** Dodo can authenticate a live key while the merchant still cannot collect payments. */
export function isDodoLivePaymentsUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    "status" in error &&
    error.status === 403 &&
    /\blive payments not enabled for merchant\b/i.test(error.message)
  );
}

/** A timeout/server error may have happened after the provider accepted a write. */
export function isDefinitiveProviderRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: unknown; statusCode?: unknown };
  const status = value.status ?? value.statusCode;
  return (
    typeof status === "number" && status >= 400 && status < 500 && ![408, 409, 429].includes(status)
  );
}
