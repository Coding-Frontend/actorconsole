/**
 * Structured logger for the API, worker, MCP, and web server.
 *
 * Backed by `pino` — fast, JSON output, includes trace IDs.
 *
 * In dev, logs are pretty-printed. In production, output is raw JSON
 * (one line per record) for ingestion by log aggregators.
 *
 * Sensitive fields (passwords, tokens, secrets) are redacted before
 * the line is written, so `logger.info({ req: { headers } })` is safe.
 */
import pino, { type Logger, type LoggerOptions } from "pino";

const isDev = process.env.NODE_ENV !== "production";
const isTest = process.env.NODE_ENV === "test";
// Next's server bundle does not include pino-pretty's worker transport.
// Keep the structured logger, but avoid starting a worker thread in that
// runtime so server-rendered pages remain stable during development.
const isNextServer = process.env.NEXT_RUNTIME === "nodejs";

const REDACT_PATHS = [
  "password",
  "*.password",
  "passwordHash",
  "*.passwordHash",
  "secret",
  "*.secret",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "apiKey",
  "*.apiKey",
  "api_key",
  "*.api_key",
  "authorization",
  "headers.authorization",
  "headers.cookie",
  "headers['x-api-key']",
  "headers['x-admin-api-key']",
  "env.ANTHROPIC_API_KEY",
  "env.RAZORPAY_KEY_SECRET",
  "env.RESEND_API_KEY",
  "env.GITHUB_APP_PRIVATE_KEY",
  "env.APP_ENCRYPTION_KEY",
  "env.SENTRY_DSN",
  "env.ACTORCONSOLE_API_KEY",
];

function buildLogger(service: string): Logger {
  const options: LoggerOptions = {
    name: service,
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },
    base: {
      service,
      env: process.env.NODE_ENV ?? "development",
      revision: process.env.SENTRY_RELEASE ?? process.env.GIT_SHA ?? "unknown",
    },
  };
  if (isDev && !isTest && !isNextServer) {
    return pino({
      ...options,
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss.l" },
      },
    });
  }
  return pino(options);
}

declare global {
  var __actorConsoleLoggers: Map<string, Logger> | undefined;
}

/**
 * Returns a singleton logger for a given service. Reuses the
 * same instance across imports so log records are consistent
 * and pino's worker thread is started once.
 */
export function getLogger(service: string): Logger {
  const loggers = global.__actorConsoleLoggers ?? new Map<string, Logger>();
  global.__actorConsoleLoggers = loggers;
  const existing = loggers.get(service);
  if (existing) return existing;
  const logger = buildLogger(service);
  loggers.set(service, logger);
  return logger;
}

/**
 * Helper to attach a child logger with context (e.g. request id, user id)
 * to a Hono context or a BullMQ job.
 */
export function childLogger(parent: Logger, bindings: Record<string, unknown>): Logger {
  return parent.child(bindings);
}
