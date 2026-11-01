import { access, cp, rm } from "node:fs/promises";
import { resolve } from "node:path";

/** Match Docker's standalone layout, including assets Next intentionally omits. */
export async function prepareStandaloneWeb() {
  const directory = resolve("apps/web/.next/standalone/apps/web");
  const server = resolve(directory, "server.js");
  await access(server);
  // Repeated runs seed new articles. Start with the same empty runtime fetch
  // cache as a fresh container, instead of reusing a previous run's CMS feed.
  const fetchCache = resolve(directory, ".next/cache/fetch-cache");
  if (!fetchCache.startsWith(`${directory}\\`) && !fetchCache.startsWith(`${directory}/`))
    throw new Error("E2E fetch cache must stay inside the standalone application");
  await rm(fetchCache, { recursive: true, force: true });
  await cp(resolve("apps/web/public"), resolve(directory, "public"), { recursive: true });
  await cp(resolve("apps/web/.next/static"), resolve(directory, ".next/static"), {
    recursive: true,
  });
  return server;
}
