/**
 * Display label for a credential (used by the admin UI to render partial values).
 */
export function maskIntegrationValue(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 10) return "•".repeat(value.length);
  return `${value.slice(0, 4)}${"•".repeat(Math.max(8, value.length - 8))}${value.slice(-4)}`;
}

export type ApifyConsoleCredentialKey = "apify_ui_token" | "apify_cookies";

/**
 * Select the Console credential that the server should use for platform
 * operations. Prefer cookies so the Console UI token is obtained automatically.
 * A failed credential must not shadow a healthy alternative.
 * Unknown/un-tested credentials remain eligible so a newly configured value
 * can be validated by the first real request.
 */
export function selectActiveApifyConsoleCredential(input: {
  uiConfigured: boolean;
  uiTestStatus?: string | null;
  cookiesConfigured: boolean;
  cookiesTestStatus?: string | null;
}): ApifyConsoleCredentialKey | null {
  const candidates: Array<{
    key: ApifyConsoleCredentialKey;
    configured: boolean;
    testStatus?: string | null;
  }> = [
    {
      key: "apify_cookies",
      configured: input.cookiesConfigured,
      testStatus: input.cookiesTestStatus,
    },
    {
      key: "apify_ui_token",
      configured: input.uiConfigured,
      testStatus: input.uiTestStatus,
    },
  ];
  return (
    candidates.find(
      (candidate) => candidate.configured && candidate.testStatus?.toLowerCase() !== "error",
    )?.key ?? null
  );
}
