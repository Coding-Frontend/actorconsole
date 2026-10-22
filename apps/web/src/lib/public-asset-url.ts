import { API_BASE_URL } from "./api-base";

/** Catalog assets remain API-owned when the frontend is served by Pages. */
export function publicAssetUrl(src: string | Blob | undefined) {
  return typeof src === "string" && src.startsWith("/api/website-logo-assets/")
    ? `${API_BASE_URL}${src.slice(4)}`
    : src;
}
