/**
 * Shared test fixtures for API route tests.
 *
 * Every route in apps/api/src/routes/*.ts is a Hono sub-app. To test
 * a route, we mount it on a fresh Hono instance, mock out the bits of
 * the runtime that the route touches (db, queue, getRedis, apify, etc.),
 * and hit the resulting app with `app.request()`.
 *
 * This helper centralises the boilerplate so individual tests stay
 * focused on behaviour.
 */
import { Hono } from "hono";
import { vi } from "vitest";

export type SessionFixture = {
  userId: string;
  email: string;
  plan: "FREE" | "PRO";
};

/** Default free-tier user for tests that don't override. */
export const defaultSession: SessionFixture = {
  userId: "user_test_1",
  email: "tester@actorconsole.com",
  plan: "FREE",
};

/**
 * Build a Hono app with the route mounted and a stubbed auth middleware
 * that injects a fixed session, so route handlers can read
 * `c.get("session")` without us having to set a real session cookie.
 *
 * Use this when the route uses `requireAuth()` (the common case). For
 * public routes, the `session` field on the context will be `undefined`.
 */
export function buildAppWithSession(
  route: Hono,
  path: string,
  session: SessionFixture = defaultSession,
) {
  const app = new Hono();
  app.use(path, async (c, next) => {
    c.set("session", session as never);
    await next();
  });
  app.route(path, route);
  return app;
}

/**
 * Mock the Auth.js session lookup so the real `requireAuth()` middleware
 * finds a valid session when given a session token. Returns the
 * token + the mock session row to assert on.
 */
export const MOCK_SESSION_TOKEN = "test-session-token-abc";

export function mockSessionLookup({
  db,
  session = defaultSession,
  expired = false,
}: {
  db: { session: { findUnique: ReturnType<typeof vi.fn> } };
  session?: SessionFixture;
  expired?: boolean;
}) {
  db.session.findUnique.mockResolvedValue({
    userId: session.userId,
    expires: expired ? new Date(Date.now() - 1000) : new Date(Date.now() + 60 * 60 * 1000),
    user: {
      id: session.userId,
      email: session.email,
      plan: session.plan,
    },
  });
}

/** Standard headers to set when the request needs a session cookie. */
export const sessionCookieHeader = (token = MOCK_SESSION_TOKEN) => ({
  Cookie: `authjs.session-token=${token}`,
});
