/**
 * Sentry initialization helpers for the API and worker.
 *
 * Sentry is opt-in via the SENTRY_DSN env var. When unset, the helper
 * is a no-op so local dev and CI never need a DSN configured.
 *
 * Each app should call the relevant `init*` function as early as
 * possible (before other imports that might throw) and import
 * `./sentry-instrumentation` if it uses file-based loading (e.g. Next.js).
 */

import type { NodeOptions } from "@sentry/node";

export type AppKind = "api" | "worker" | "mcp" | "web";

export interface SentryConfig {
  dsn?: string;
  environment: string;
  release?: string;
  /** Sample rate for transactions, 0..1. Default 0.1 (10%). */
  tracesSampleRate?: number;
  /** Sample rate for error events, 0..1. Default 1.0. */
  sampleRate?: number;
  /** Service name, used in Sentry's "server_name" tag and transactions. */
  serverName: string;
}

export function sentryConfigFor(app: AppKind): SentryConfig {
  return {
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
      ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE)
      : 0.1,
    sampleRate: process.env.SENTRY_SAMPLE_RATE ? Number(process.env.SENTRY_SAMPLE_RATE) : 1.0,
    serverName: `actorconsole-${app}`,
  };
}

/**
 * Initialise Sentry for a Node.js process (API, worker, MCP).
 * No-op if DSN is not configured.
 *
 * Returns the Sentry module on success, `null` if DSN was missing.
 */
export async function initNodeSentry(app: AppKind): Promise<typeof import("@sentry/node") | null> {
  const cfg = sentryConfigFor(app);
  if (!cfg.dsn) return null;
  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn: cfg.dsn,
    environment: cfg.environment,
    release: cfg.release,
    tracesSampleRate: cfg.tracesSampleRate,
    sampleRate: cfg.sampleRate,
    serverName: cfg.serverName,
    // Don't send PII by default. Set to true only if you're capturing
    // user context intentionally.
    sendDefaultPii: false,
  } satisfies NodeOptions);
  return Sentry;
}

/**
 * Wrap a function so any uncaught error is reported to Sentry
 * before being re-thrown. Use sparingly — prefer the global
 * `app.onError` hook in Hono and BullMQ's `failed` event in workers.
 */
export async function withSentry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const Sentry = await import("@sentry/node");
    Sentry.captureException(err);
    throw err;
  }
}
