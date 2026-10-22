/** Dodo can authenticate a live key while the merchant still cannot collect payments. */
export function isDodoLivePaymentsUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    "status" in error &&
    error.status === 403 &&
    /\blive payments not enabled for merchant\b/i.test(error.message)
  );
}
