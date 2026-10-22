const configuredPublicApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
const configuredServerApiBase =
  process.env.API_BASE_URL ??
  (configuredPublicApiBase?.startsWith("http") ? configuredPublicApiBase : undefined);

/** Public same-origin API path. It forwards backend session cookies through Next.js. */
export const API_BASE_URL = (configuredPublicApiBase ?? "/api").replace(/\/+$/, "");

/** Direct API origin for server-only code and proxy route handlers. */
export const SERVER_API_BASE_URL = (configuredServerApiBase ?? "http://localhost:4000").replace(
  /\/+$/,
  "",
);
