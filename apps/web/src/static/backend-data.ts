import { API_BASE_URL } from "./api-base";
import { decodeApiData } from "@actorconsole/shared/api-data";
import { PUBLIC_CATALOG_OPERATIONS } from "../lib/public-cache-policy";
import { fetchRead } from "../lib/read-request";
import { canonicalCatalogArgs } from "../../../../.deploy/pages/public-catalog-query.js";
const cache = new Map<string, { expires: number; encoded: unknown }>();
const pending = new Map<string, Promise<unknown>>();
export async function backendData<T>(operation: string, args: unknown[] = []): Promise<T> {
  if (!PUBLIC_CATALOG_OPERATIONS.has(operation))
    throw new Error("Unknown public catalog operation");
  const queryArgs = canonicalCatalogArgs(operation, args);
  const key = JSON.stringify([operation, queryArgs]);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return decodeApiData(cached.encoded) as T;
  let request = pending.get(key);
  if (!request) {
    const url = new URL(`/public/catalog/${operation}`, `${API_BASE_URL}/`);
    url.searchParams.set("args", JSON.stringify(queryArgs));
    request = fetchRead(url.href, { credentials: "omit" }, 25_000)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Catalog unavailable (${response.status})`);
        const body = await response.json();
        if (body.ok !== true) throw new Error("Invalid catalog response");
        cache.set(key, { expires: Date.now() + 60_000, encoded: body.data });
        if (cache.size > 128) cache.delete(cache.keys().next().value!);
        return body.data;
      })
      .finally(() => pending.delete(key));
    if (pending.size < 128) pending.set(key, request);
  }
  return decodeApiData(await request) as T;
}
