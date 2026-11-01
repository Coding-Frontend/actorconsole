import type { Context, Next } from "hono";
import type { AppEnv } from "../app.js";
import { AppError } from "./error.js";

/** Credential and lifecycle changes belong to the owner, never a support delegate. */
export function requireOwnerSession(options: { recent?: boolean } = {}) {
  return async (c: Context<AppEnv>, next: Next) => {
    const session = c.get("session");
    if (session?.authMethod !== "session" || session.impersonatedById) {
      throw new AppError("owner_session_required", "Sign in as the account owner to continue", 403);
    }
    const authenticatedAt = Date.parse(session.authenticatedAt ?? "");
    if (
      options.recent &&
      (!Number.isFinite(authenticatedAt) ||
        authenticatedAt > Date.now() ||
        Date.now() - authenticatedAt > 15 * 60_000)
    ) {
      throw new AppError(
        "reauthentication_required",
        "Sign in again before changing account security",
        403,
      );
    }
    return next();
  };
}
