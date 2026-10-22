// Hono entry point. Run with: pnpm dev (inside apps/api) or pnpm dev:api (root).
import { serve } from "@hono/node-server";
import { getLogger, initNodeSentry } from "@actorconsole/shared";
import { initOpenTelemetry } from "@actorconsole/shared/telemetry";
import { apiEnv } from "./config/env.js";
import { app } from "./app.js";

// Sentry must be initialised before any other imports that might throw.
// `initNodeSentry` is a no-op when SENTRY_DSN is not set, so local dev
// doesn't need a DSN.
await initOpenTelemetry("actorconsole-api");
await initNodeSentry("api");
const log = getLogger("api");

const port = apiEnv.API_PORT;

serve(
  {
    fetch: app.fetch,
    hostname: apiEnv.API_HOST,
    port,
  },
  (info) => {
    log.info({ port: info.port }, "API listening");
  },
);
