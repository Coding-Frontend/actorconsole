---
applyTo: "apps/worker/**"
description: "Instructions for the BullMQ background worker."
---

# apps/worker — BullMQ Background Worker

## Stack
- **BullMQ** job queues with **ioredis**
- **Octokit** for GitHub API (code review, PR management)
- **Resend** for email notifications
- **cron-parser** for schedule evaluation
- **Sentry** for error tracking (optional, no-op without `SENTRY_DSN`)
- **OpenTelemetry** for optional OTLP traces
- **Database:** MySQL via Prisma singleton from `@actorconsole/db`

## General Conventions
- **TypeScript strict mode**, ES modules (`"type": "module"`), target ES2022.
- **Import with `.js` extensions** for relative imports.
- **Import packages** by name: `import { db, Prisma } from "@actorconsole/db"`.
- Use the shared structured logger (`getLogger`) for operational output; never log credentials or decrypted integration values.
- **Environment:** `apps/worker/.env` for local `pnpm dev:worker`; production values come from `/opt/actorconsole-vps/shared/.env.production` (`.env.vps.example`). The worker runs on the VPS, not Vercel. Follow root `deployment.instructions.md` for direct backend releases without waiting for GitHub CI/CD.

## Entry point (`src/index.ts`)
Single-file worker that:
1. Initializes OpenTelemetry and Sentry
2. Creates Redis singleton (`global.__redis`)
3. Creates BullMQ `Worker` instances for each queue
4. Registers job processors with `worker.process()`
5. Handles graceful shutdown on SIGTERM/SIGINT

### Startup
```ts
await initNodeSentry("worker");
// Workers are created inline in index.ts
```

## Queue names
| Queue | Purpose |
|---|---|
| `schedules` | Bulk publishing and Actor lifecycle operations |
| `snapshots` | Actor snapshots and workspace inventory/bootstrap |
| `catalog` | Public Store catalog, website classification and logo enrichment |
| `audience` | Workspace audience refresh |
| `newsletter` | Newsletter campaigns |
| `optimization` | Actor audits and optimization proposals |

### Queue type safety
Use the actual `QueueName` / `JobPayloadMap` contract in
`apps/api/src/lib/queue.ts` and registered handlers in the worker entry point.
Shared retry defaults are in `packages/shared/src/queue/retry-policies.ts`.

## Job processing
Each queue has a processor function that:
1. Receives the job data
2. Looks up related DB records
3. Performs the work (API calls, AI prompts, email, etc.)
4. Updates DB status
5. Returns a result

### Example pattern
```ts
const worker = new Worker("schedules", async (job) => {
  const { scheduleId } = job.data;
  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    include: { actor: true, user: true },
  });
  if (!schedule || !schedule.enabled) return;

  // ... process the schedule
  await db.schedule.update({
    where: { id: scheduleId },
    data: { lastRunAt: new Date() },
  });
}, { connection: redis });
```

## Key patterns

### Leader election (`src/lib/leader-election.ts`)
`createLeaderLock(key, ttlSeconds)` — Redis `SET key token NX EX ttl` with Lua-script release. Only one worker replica acquires the lock per TTL window; others no-op.

Used for cron tick evaluation — prevents duplicate schedule runs across replicas:
```ts
const lock = createLeaderLock("actorconsole:worker:schedule-tick:lock", 25);
// In the cron tick handler:
const acquired = await lock.tryAcquire(redis);
if (!acquired) return; // another replica is handling this tick
try {
  // ... evaluate schedules
} finally {
  await lock.release(redis);
}
```

### Redis singleton
Global `__redis` instance with `maxRetriesPerRequest: null` (required by BullMQ):
```ts
function getRedis(): IORedis {
  if (!global.__redis) {
    global.__redis = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return global.__redis;
}
```

### Snapshot retention (`src/lib/retention.ts`)
`pruneOldSnapshots()` — deletes `ActorSnapshot` rows older than 90 days (configurable via `ACTOR_SNAPSHOT_RETENTION_DAYS`). Emits Sentry breadcrumb on success. Swallows errors — retention failures must never crash the worker.

### Schedule processing
The worker evaluates cron schedules using `cron-parser`. For each enabled schedule:
1. Parse the cron expression
2. Check if it's due (based on `lastRunAt`)
3. Execute the action (`rewrite_copy`, `review_code`, etc.)
4. Update `lastRunAt` and `lastRunStatus`
5. Send email notification to user (via Resend)

### Actions handled
- `rewrite_copy` — AI rewrites actor title/description, publishes to Apify
- `review_code` — AI reviews latest GitHub PR, posts comments
- `take_snapshot` — Captures actor stats for analytics
- `run_actor` — Triggers an Apify actor run

### Email
Direct Resend client (not the shared `sendEmail` from api):
```ts
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
await resend.emails.send({ from, to, subject, html });
```
If the Resend integration is missing or the provider rejects the message, the worker writes a
failed `EmailLog` row and a structured warning. It never treats a console log as successful delivery.

## Testing
- **Vitest** with `vitest.config.ts`
- Tests in `test/lib/*.test.ts`

## Scripts
- `pnpm dev` — `node --env-file=.env --import=tsx --watch src/index.ts`
- `pnpm build` — `tsc`
- `pnpm test` — `vitest run`
