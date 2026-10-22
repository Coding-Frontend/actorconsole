---
applyTo: "apps/api/**"
description: "Instructions for the Hono REST API backend."
---

# apps/api — Hono REST API

## Stack
- **Hono** web framework with `@hono/node-server`
- **Zod OpenAPI** (`@hono/zod-openapi`, `@hono/zod-validator`) for request validation
- **BullMQ** for enqueuing background jobs via `ioredis`
- **Resend** for transactional email (via `lib/email.ts`)
- **Sentry** for error tracking (optional, no-op without `SENTRY_DSN`)
- **Database:** MySQL via Prisma singleton from `@actorconsole/db`

## General Conventions
- **TypeScript strict mode**, ES modules (`"type": "module"`), target ES2022.
- **Import with `.js` extensions** for relative imports: `import { db } from "./lib/cache.js"`.
- **Import packages** by name: `import { db } from "@actorconsole/db"`, `import { getLogger } from "@actorconsole/shared"`.
- **No `console.log`** in production code — use `getLogger("name")` from `@actorconsole/shared`. Exception: startup messages in `index.ts`.
- **Response envelope:** `{ ok: true, data: T }` for success, `{ ok: false, error: { code, message, details? } }` for errors.
- **Environment:** local backend values loaded from the root `.env`; production uses `/opt/actorconsole-vps/shared/.env.production` and `.env.vps.example`. Keep credentials on the backend; Vercel receives only `.env.vercel.example` settings.

## Hosting and authentication boundary

The Hono API runs in Docker on the VPS behind `https://api.example.com`.
Next.js runs on Vercel and forwards browser `/api/*` requests, including auth.
The API owns password authentication, Firebase identity verification, recovery,
two-factor challenges, persisted sessions, roles, impersonation and all database
queries. Compatibility cookie names do not imply an Auth.js frontend runtime.
Follow root `deployment.instructions.md`: the documented backend and frontend release procedure for your installation.

## Route structure
Routes live in `src/routes/<domain>.ts`. Each file exports a named `Hono<AppEnv>` instance:

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppEnv } from "../app.js";

export const myRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    return c.json({ ok: true, data: result });
  })
  .post("/", zValidator("json", mySchema), async (c) => {
    const body = c.req.valid("json");
    // ...
  });
```

Routes are mounted in `src/app.ts` with path prefixes and middleware:
```ts
app.use("/actors/*", requireAuth());
app.use("/actors/*", enforcePlanLimits());
app.route("/actors", actorRoutes);
```

### Route file list
`account.ts`, `actors.ts`, `admin.ts`, `announcements.ts`, `apify.ts`, `blog.ts`, `github-pat.ts`, `github.ts`, `health.ts`, `keywords.ts`, `mcp.ts`, `newsletter.ts`, `notifications.ts`, `openapi.ts`, `otp.ts`, `policies.ts`, `razorpay.ts`, `schedules.ts`, `tickets.ts`, `webhooks.ts`

## Middleware
- **`requireAuth()`** (`src/middleware/auth.ts`) — reads `authjs.session-token` cookie or `Authorization: Bearer` header, looks up session in DB, sets `c.get("session")` with `{ userId, email, plan }`.
- **`requireAdmin()`** (`src/middleware/admin.ts`) — same + checks `user.role === "ADMIN" | "SUPER_ADMIN"`. Also supports `x-admin-api-key` header for service-to-service.
- **`enforcePlanLimits()`** (`src/middleware/plan-limits.ts`) — FREE=1 actor, PRO=unlimited. Actor count cached 60s.
- **`errorHandler()` / `onErrorHandler()`** (`src/middleware/error.ts`) — catches all errors, redacts sensitive patterns (file paths, credentials, ORM internals, stack traces), returns structured JSON. Reports non-AppError to Sentry.

## Error handling
- **`AppError`** — custom error class with `code`, `status`, `message`, `details`. Throw these for user-facing errors (4xx).
- Unknown errors are redacted: messages containing file paths, credentials, ORM internals, or stack traces become `"Internal server error"`.
- All errors are logged server-side with full context via `getLogger`.

## Key library patterns

### Integrations (`src/lib/integrations.ts`)
`getIntegration(key)` resolves credentials from DB first, then env fallback. Secrets are AES-256-GCM encrypted with `APP_ENCRYPTION_KEY`.

### Cache (`src/lib/cache.ts`)
`cacheGet/set/delete` — Redis with in-memory fallback when Redis isn't configured. TTL in seconds. Failures are silently swallowed — cache is never critical.

### Rate limiting (`src/lib/rate-limit.ts`)
`checkRateLimit(key, { windowMs, max })` — Redis sorted set with in-memory fallback. Returns `{ allowed, remaining, retryAfterMs }`.

### Analytics (`src/lib/analytics.ts`)
`trackEvent(name, { userId, properties })` — fire-and-forget writes to `AnalyticsEvent` table. Never awaited, never throws.

### Queue (`src/lib/queue.ts`)
`enqueue(queueName, payload)` — picks up shared retry policies from `@actorconsole/shared/queue/retry-policies`. Returns job ID or null if Redis unavailable.
Queue names: `"schedules" | "snapshots" | "audience" | "catalog" | "newsletter" | "optimization"`. The payload contract is `JobPayloadMap` in `src/lib/queue.ts`.

### Email (`src/lib/email.ts`)
`sendEmail(input)` via Resend — best-effort, never throws. Reads config from `getIntegration()`.

### GitHub PAT (`src/lib/github-pat.ts`)
Per-user PAT handling with AES-256-GCM encryption. Custom error classes `GitHubPatInvalidError`, `GitHubPatNetworkError`.

## Testing
- **Vitest** with `vitest.config.ts`
- Tests in `test/routes/*.test.ts` and `test/middleware/*.test.ts`
- Use `createTestApp(...routes)` from `test/helpers.ts` — mounts routes with production error handler
- Use `withSession(app)` — wraps app to inject `authjs.session-token=valid-token` cookie on all requests
- Fixtures in `test/fixtures/`

### Example test pattern
```ts
import { describe, it, expect } from "vitest";
import { createTestApp, withSession } from "../helpers.js";
import { myRoutes } from "../../src/routes/my-domain.js";

describe("GET /my-domain", () => {
  it("returns data", async () => {
    const app = withSession(createTestApp(["/my-domain", myRoutes]));
    const res = await app.request("/my-domain");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
```

## Scripts
- `pnpm dev` — `tsx watch src/index.ts` (hot reload, port 4000)
- `pnpm build` — `tsc`
- `pnpm test` — `vitest run`
