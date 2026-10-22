import { ApifyClientError } from "./errors";

const UI_TOKEN_PATTERN = /(?:^|[^A-Za-z0-9_-])(apify_ui_[A-Za-z0-9_-]{12,})(?=$|[^A-Za-z0-9_-])/;

/**
 * Accept a raw Console UI token or copied request text and return only the
 * credential. Cookies and the rest of a copied cURL command are discarded
 * before anything is validated or encrypted.
 */
export function normalizeConsoleUiToken(rawValue: string): string {
  const match = ` ${rawValue.trim()} `.match(UI_TOKEN_PATTERN);
  if (match?.[1]) return match[1];

  throw new ApifyClientError(
    "validation",
    "Paste an Apify Console UI token (apify_ui_…), an Authorization: Bearer header, or copied cURL containing that token. The ApifyRT cookie is not required.",
    { status: 422 },
  );
}

type CookieEntry = { name: string; value: string; domain?: string };

/**
 * Normalize Cookie headers, browser-extension JSON exports, a bundle of the
 * two Console domains, or a copied authentication/resume cURL. Only cookie
 * name/value pairs are returned, so copied commands and unrelated metadata
 * are never encrypted.
 */
export function normalizeConsoleCookies(rawValue: string): string {
  const value = rawValue.trim();
  if (!value) return "";
  return validateConsoleCookiePairs(parseCookieSource(value));
}

function parseCookieSource(value: string): string[] {
  const parsedSources = parseJsonCookieSources(value);
  if (parsedSources.length > 0) {
    return parsedSources.flatMap((source) => parseCookieSource(source));
  }
  const curlSources = extractCurlCookieSources(value);
  if (curlSources.length > 0) {
    return curlSources.flatMap((source) => parseCookiePairs(source));
  }
  return parseCookiePairs(value.replace(/^cookie\s*:\s*/i, ""));
}

function parseJsonCookieSources(value: string): string[] {
  if (!value.startsWith("[") && !value.startsWith("{")) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return pairsFromCookieEntries(parsed);
  if (!isRecord(parsed)) return [];

  if (Array.isArray(parsed.cookies)) return pairsFromCookieEntries(parsed.cookies);
  if (typeof parsed.name === "string" && typeof parsed.value === "string") {
    return pairsFromCookieEntries([parsed]);
  }

  const bundledSources = [
    parsed.console,
    parsed.consoleApify,
    parsed.consoleBackend,
    parsed.resumeCurl,
    ...(Array.isArray(parsed.sources) ? parsed.sources : []),
  ].filter((source): source is string => typeof source === "string" && source.trim().length > 0);
  if (bundledSources.length > 0) return bundledSources;

  const simplePairs = Object.entries(parsed)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, cookieValue]) => name + "=" + cookieValue);
  return simplePairs.length > 0 ? [simplePairs.join("; ")] : [];
}

function pairsFromCookieEntries(entries: unknown[]): string[] {
  const validEntries = entries.filter(isCookieEntry);
  const incorrectlyScopedRefreshToken = validEntries.find(
    (cookie) =>
      cookie.name === "ApifyRT" &&
      cookie.domain &&
      !normalizeDomain(cookie.domain).endsWith("console-backend.apify.com"),
  );
  if (incorrectlyScopedRefreshToken) {
    throw new ApifyClientError(
      "validation",
      "ApifyRT must be copied from console-backend.apify.com. Export that domain's cookies in addition to console.apify.com.",
      { status: 422 },
    );
  }
  return [validEntries.map(({ name, value }) => name + "=" + value).join("; ")];
}

function extractCurlCookieSources(value: string): string[] {
  if (!/\bcurl\b/i.test(value)) return [];
  if (
    !/https:\/\/console-backend\.apify\.com\/public\/authentication\/resume(?:['"?\s]|$)/i.test(
      value,
    )
  ) {
    throw new ApifyClientError(
      "validation",
      "Cookie cURL input must target https://console-backend.apify.com/public/authentication/resume",
      { status: 422 },
    );
  }
  const sources: string[] = [];
  const cookieArgument = /(?:^|\s)(?:-b|--cookie)(?:\s+|=)(['"])([\s\S]*?)\1/g;
  const cookieHeader = /(?:^|\s)(?:-H|--header)(?:\s+|=)(['"])(cookie\s*:[\s\S]*?)\1/gi;

  for (const match of value.matchAll(cookieArgument)) {
    if (match[2]) sources.push(match[2]);
  }
  for (const match of value.matchAll(cookieHeader)) {
    if (match[2]) sources.push(match[2].replace(/^cookie\s*:\s*/i, ""));
  }
  if (sources.length === 0) {
    throw new ApifyClientError(
      "validation",
      "The copied cURL does not contain a Cookie header. Copy the console-backend.apify.com/public/authentication/resume request as cURL.",
      { status: 422 },
    );
  }
  return sources;
}

function parseCookiePairs(source: string): string[] {
  const value = source.trim().replace(/^cookie\s*:\s*/i, "");
  if (/[\r\n]/.test(value)) {
    throw new ApifyClientError("validation", "An Apify Cookie header cannot contain line breaks", {
      status: 422,
    });
  }
  const pairs = value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (pairs.length === 0 || pairs.some((pair) => !pair.includes("="))) {
    throw new ApifyClientError(
      "validation",
      "Provide browser cookie exports, a Cookie request header, or the copied authentication/resume cURL",
      { status: 422 },
    );
  }
  return pairs;
}

function validateConsoleCookiePairs(rawPairs: string[]): string {
  const pairsByName = new Map<string, string>();
  for (const pair of rawPairs) {
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator).trim();
    const cookieValue = pair.slice(separator + 1).trim();
    if (name && cookieValue) pairsByName.set(name, name + "=" + cookieValue);
  }
  if (!pairsByName.has("ApifyRT")) {
    throw new ApifyClientError(
      "validation",
      "The ApifyRT cookie is missing. Copy it from console-backend.apify.com, or paste the copied /public/authentication/resume cURL.",
      { status: 422 },
    );
  }
  // ApifyRT is the only cookie required by the authentication/resume request.
  // Do not retain analytics, marketing, Intercom, HubSpot, or other browser
  // cookies included by Chrome's Copy-as-cURL/export flows.
  return pairsByName.get("ApifyRT")!;
}

function normalizeDomain(domain: string): string {
  return domain.trim().replace(/^\./, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCookieEntry(value: unknown): value is CookieEntry {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.value === "string" &&
    (value.domain === undefined || typeof value.domain === "string")
  );
}
