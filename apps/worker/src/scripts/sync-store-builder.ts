import { createApifyClient } from "@actorconsole/apify";
import { db } from "@actorconsole/db";
import { syncStoreActorDetails, syncStoreSearchCatalog } from "../lib/store-catalog.js";

const username = process.argv[2]?.trim();
const skipDetails = process.argv.includes("--skip-details");
if (!username) {
  throw new Error("Usage: sync-store-builder <apify-builder-username>");
}

try {
  // This is intentionally anonymous: public Store metadata must not depend on
  // an administrator's publishing credential being live.
  const apify = createApifyClient();
  const search = await syncStoreSearchCatalog(apify, {
    builderUsername: username,
    completeCatalog: true,
    reconcileBuilders: false,
  });
  const details = skipDetails
    ? null
    : await syncStoreActorDetails(apify, {
        builderUsername: username,
        // A deliberately conservative cadence keeps this operator recovery path
        // within the same retry/rate-limit envelope as the scheduled worker.
        concurrency: 4,
        batchDelayMs: 350,
      });
  // CLI output is the contract of this one-shot maintenance script.
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({ username, search, details }));
} finally {
  await db.$disconnect();
}
