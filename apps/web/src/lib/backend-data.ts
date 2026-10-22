import "server-only";
import { cache } from "react";
import { createHash, randomUUID } from "node:crypto";
import { unstable_cache } from "next/cache";
import { SERVER_API_BASE_URL } from "./api-base";
import { decodeApiData } from "@actorconsole/shared/api-data";
import { PUBLIC_CATALOG_OPERATIONS, PUBLIC_CATALOG_TAG, PUBLIC_CACHE_SECONDS } from "./public-cache-policy";

async function loadPublicData(operation: string, argsJson: string) {
  const url = new URL(`/public/catalog/${operation}`, `${SERVER_API_BASE_URL}/`);
  url.searchParams.set("args", argsJson);
  const queryHash = createHash("sha256").update(argsJson).digest("hex").slice(0, 12);
  const response = await fetch(url, {
    cache: "no-store", signal: AbortSignal.timeout(25_000),
    // Identify real origin reads in API logs without exposing query text.
    headers: { "x-request-id": `web-catalog-${operation}-${queryHash}-${randomUUID()}` },
  });
  if (!response.ok) throw new Error(`Catalog API unavailable (${response.status})`);
  const body = await response.json();
  if (body.ok !== true) throw new Error("Invalid catalog API response");
  // Cache the encoded JSON, so Maps, Dates, and numeric wire values retain
  // their types after Next.js persists the value between requests.
  return body.data;
}

// Collapse simultaneous cold misses inside each Next.js process. Bound
// the map; keys contain public filters only, never cookies or credentials.
const pending = new Map<string, Promise<unknown>>();
async function singlePublicRead(operation: string, argsJson: string) {
  const key = `${operation}:${argsJson}`;
  const running = pending.get(key);
  if (running) return running;
  const result = loadPublicData(operation, argsJson);
  if (pending.size >= 128) return result;
  pending.set(key, result);
  try { return await result; }
  finally { if (pending.get(key) === result) pending.delete(key); }
}

const cachedPublicData = cache(unstable_cache(
  singlePublicRead,
  ["public-catalog-v1", SERVER_API_BASE_URL],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [PUBLIC_CATALOG_TAG] },
));

/** Anonymous public reads reuse the Next.js Data Cache and the current render. */
export async function backendData<T>(operation: string, args: unknown[] = []): Promise<T> {
  if (!PUBLIC_CATALOG_OPERATIONS.has(operation)) throw new Error("Unknown public catalog operation");
  return decodeApiData(await cachedPublicData(operation, JSON.stringify(args))) as T;
}
