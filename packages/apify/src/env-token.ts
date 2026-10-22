/**
 * Legacy environment-backed client for package consumers that need a single
 * Apify token. The current `apps/mcp` server uses the authenticated
 * ActorConsole API instead; API and worker jobs always use the actor owner's
 * stored token through `getUserApifyClient`.
 */

import { createApifyClient, type ApifyClientWrapper } from "./client";

let _client: ApifyClientWrapper | null = null;

export function getApifyFromEnv(): ApifyClientWrapper {
  if (_client) return _client;
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error(
      "APIFY_API_TOKEN is not set. Configure it in the environment of the package consumer.",
    );
  }
  _client = createApifyClient({ token });
  return _client;
}

/** Test-only: reset the singleton so the next call re-reads env. */
export function resetApifyFromEnv(): void {
  _client = null;
}
