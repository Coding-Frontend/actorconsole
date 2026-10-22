/**
 * Shared test utilities for API route tests.
 *
 * Provides a `createTestApp` helper that mounts a route with the same
 * error handling as the production app (onErrorHandler), so thrown
 * AppErrors return the correct HTTP status code instead of 500.
 */
import { Hono } from "hono";
import { onErrorHandler } from "../../src/middleware/error.js";

/**
 * Create a test-ready Hono app that mounts the given route(s) with
 * the production error handler. This ensures that `throw new AppError(...)`
 * inside route handlers returns the expected status code.
 */
export function createTestApp(...routes: Parameters<Hono["route"]>[]): Hono {
  const app = new Hono();
  app.onError(onErrorHandler);
  for (const [path, handler] of routes) {
    app.route(path, handler);
  }
  return app;
}

/**
 * Inject a session into all requests to the given app.
 * Wraps the app's request method so every call includes a valid
 * authjs.session-token cookie.
 */
export function withSession(app: Hono) {
  return {
    request(path: string, init?: RequestInit) {
      return app.request(path, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string>),
          cookie: "authjs.session-token=valid-token",
        },
      });
    },
  };
}
