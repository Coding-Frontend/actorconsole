export type CookieCandidate = Pick<
  chrome.cookies.Cookie,
  "name" | "value" | "domain" | "expirationDate"
>;

export type CookieSelection =
  | { ok: true; value: string }
  | { ok: false; reason: "missing" | "wrong_domain" | "expired"; message: string };

/**
 * Select the single authentication cookie that is actually sent to
 * ActorConsole. The console-domain query is diagnostic only; unrelated
 * cookies and complete cookie exports are never returned.
 */
export function selectApifyRtCookie(
  backendCookies: CookieCandidate[],
  consoleCookies: CookieCandidate[],
  nowSeconds = Date.now() / 1_000,
): CookieSelection {
  const backendCandidates = backendCookies.filter(
    (cookie) => cookie.name === "ApifyRT" && cookie.value.length > 0,
  );
  const liveBackend = backendCandidates.find(
    (cookie) => cookie.expirationDate === undefined || cookie.expirationDate > nowSeconds,
  );
  if (liveBackend) return { ok: true, value: liveBackend.value };

  if (backendCandidates.length > 0) {
    return {
      ok: false,
      reason: "expired",
      message: "The Apify Console session has expired. Sign in to Apify Console and try again.",
    };
  }

  const consoleOnly = consoleCookies.some(
    (cookie) =>
      cookie.name === "ApifyRT" &&
      cookie.value.length > 0 &&
      (cookie.expirationDate === undefined || cookie.expirationDate > nowSeconds),
  );
  if (consoleOnly) {
    return {
      ok: false,
      reason: "wrong_domain",
      message:
        "ApifyRT was found only on console.apify.com. Reload Apify Console so console-backend.apify.com can create the Console session.",
    };
  }

  return {
    ok: false,
    reason: "missing",
    message: "No ApifyRT session was found. Sign in to Apify Console, reload it, and try again.",
  };
}
