const DEVELOPMENT_APP_URL = "http://localhost:8080";

export function getAppBaseUrl(): string {
  const configured = process.env.AUTH_URL;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_URL must be configured in production");
  }

  const parsed = new URL(configured ?? DEVELOPMENT_APP_URL);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("AUTH_URL must use HTTP or HTTPS");
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("AUTH_URL must use HTTPS in production");
  }
  if (
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("AUTH_URL must be an origin without credentials, path, query, or fragment");
  }

  return parsed.origin;
}
