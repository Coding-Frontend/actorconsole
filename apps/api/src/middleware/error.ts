import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getLogger } from "@actorconsole/shared";
import { db } from "@actorconsole/db";
import { createHash } from "node:crypto";

const log = getLogger("api");

/**
 * Patterns that should never be returned to the client in a 5xx response,
 * because they likely contain internal implementation details (file paths,
 * DB connection strings, library internals).
 */
const SENSITIVE_ERROR_PATTERNS = [
  /\/(?:home|root|usr|etc|var|opt)\//i, // Unix file paths
  /[A-Z]:\\(?:Windows|Program|Users)\\/i, // Windows file paths
  /password|secret|token|api[_-]?key/i, // credential-like words
  /prisma|drizzle|knex|sequelize|mongoose/i, // ORM internals
  /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i, // network error codes
  /at .+\(.+:\d+:\d+\)/, // V8-style stack frames
  /node_modules\//, // npm paths
];

function isSensitive(message: string): boolean {
  return SENSITIVE_ERROR_PATTERNS.some((re) => re.test(message));
}

export function errorHandler() {
  return async (c: Context, next: () => Promise<void>) => {
    try {
      await next();
    } catch (err) {
      return respondToError(c, err);
    }
  };
}

/**
 * Same logic, registered via `app.onError(onErrorHandler)` instead of
 * `app.use("*", errorHandler())`. Hono v4's `app.use` try/catch only sees
 * errors from *async* handlers; `onError` catches everything including
 * synchronous throws and downstream errors. Use this in `app.ts`.
 */
export function onErrorHandler(err: Error, c: Context) {
  return respondToError(c, err);
}

function respondToError(c: Context, err: unknown) {
  const rawMessage = err instanceof Error ? err.message : "Unknown error";
  const sensitive = isSensitive(rawMessage);
  log.error(
    {
      error: {
        type: err instanceof Error ? err.name : typeof err,
        code: err instanceof AppError ? err.code : "internal_error",
        message: sensitive ? "Sensitive internal error redacted" : rawMessage,
      },
      path: c.req.path,
      method: c.req.method,
    },
    "[api] error",
  );

  // Forward non-AppError exceptions to Sentry. AppError is our own
  // 4xx-class errors; those aren't interesting to Sentry's alert rules.
  if (!(err instanceof AppError)) {
    const storedMessage = sensitive ? "Sensitive internal error redacted" : rawMessage;
    const appErrorStore = (db as typeof db & { appError?: typeof db.appError }).appError;
    if (appErrorStore && process.env.NODE_ENV !== "test") {
      void appErrorStore
        .create({
          data: {
            source: "api",
            message: storedMessage.slice(0, 10_000),
            stack:
              !sensitive && err instanceof Error && err.stack ? err.stack.slice(0, 30_000) : null,
            context: { path: c.req.path, method: c.req.method },
            severity: "error",
            fingerprint: createHash("sha256")
              .update(
                `${err instanceof Error ? err.name : typeof err}:${storedMessage}:${c.req.path}`,
              )
              .digest("hex")
              .slice(0, 32),
          },
        })
        .catch((persistError) => log.warn({ err: persistError }, "Could not persist API error"));
    }
    import("@sentry/node")
      .then((Sentry) => {
        const reportableError = sensitive ? new Error("Sensitive internal error redacted") : err;
        Sentry.captureException(reportableError, {
          tags: {
            path: c.req.path,
            method: c.req.method,
          },
        });
      })
      .catch(() => {
        // Sentry not available — fall through.
      });
  }

  if (err instanceof AppError) {
    // AppError instances are our own — their messages are intentionally
    // user-facing (e.g. "Actor not found"). Pass them through.
    return c.json(
      { ok: false, error: { code: err.code, message: err.message, details: err.details } },
      err.status as 400 | 401 | 403 | 404 | 409 | 422 | 500,
    );
  }

  // Preserve status codes and response bodies produced by Hono middleware
  // (for example CSRF's 403) instead of disguising them as internal errors.
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  if (
    err instanceof Error &&
    (err as Error & { code?: string }).code === "ai_provider_unavailable"
  ) {
    return c.json(
      {
        ok: false,
        error: {
          code: "ai_provider_unavailable",
          message: "AI generation is temporarily unavailable. Please try again shortly.",
        },
      },
      503,
    );
  }

  // Unknown / third-party errors: redact the message before sending
  // to the client. Full error is still in the server log.
  const safeMessage =
    sensitive || process.env.NODE_ENV === "production" ? "Internal server error" : rawMessage;
  return c.json({ ok: false, error: { code: "internal_error", message: safeMessage } }, 500);
}

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}
