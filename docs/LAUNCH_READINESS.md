# Launch readiness

The launch suite runs the compiled API and the standalone Next.js server against a dedicated
MariaDB database and Redis instance. SMTP delivery and the Apify API use local upstream
fixtures; application authentication, sessions, SQL persistence, authorization, and the
same-origin web API proxy remain real.

## Repeat the checks

Use MariaDB 10.11, Node.js 22.12 or newer, and pnpm 9.15. Create an empty database named
`actorconsole_e2e`, start a separate local Redis instance, and export:

```text
E2E_DATABASE_URL=mysql://YOUR_TEST_USER:YOUR_TEST_PASSWORD@127.0.0.1:3306/actorconsole_e2e
E2E_REDIS_URL=redis://127.0.0.1:6379/0
```

The database name must be `actorconsole_e2e` or start with `actorconsole_e2e_`. The runner
refuses remote databases and occupied application ports. It never resets a database or
loads the repository's private backend environment. It applies migrations and adds clearly
marked test accounts, published/draft content, and policies to the selected test database.
Use `E2E_WEB_PORT` and `E2E_API_PORT` to select unused ports (defaults: 8080 and 4000).

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm test:scripts
python scripts/test-vps-release.py
pnpm audit --prod --audit-level=high
pnpm secrets:check
pnpm test:e2e:launch --workers=2
```

Run builds/type checking before starting the application processes. On Windows, regenerating
the Prisma native engine while an API/test process has loaded it can cause an `EPERM` file lock.
Browser traces and screenshots are saved under `test-results/`; service logs are in `.cache/e2e/`.
These may contain test session details. CI uploads failed-run diagnostics with seven-day retention.

The CI workflow runs the authenticated launch suite on MariaDB 10.11 and Redis for every PR
and main-branch push. It also checks production dependency advisories and migration/schema drift.
The deploy workflow requires successful CI and secret scanning for the selected revision.

For read-only public smoke checks against an existing staging site, set `E2E_BASE_URL` and run:

```bash
pnpm exec playwright test e2e/marketing-smoke.spec.ts e2e/research-tools.spec.ts
```

## Covered flows

- Signup with required policy acceptance, actual SMTP verification email, and authenticated session.
- First workspace creation, Apify connection and inventory sync against a local upstream,
  completion of Free onboarding, workspace-scoped credential storage, and logout/login.
- Password reset using the emailed code, one-time code consumption, old-password rejection,
  and revocation of existing sessions.
- Concurrent registrations, anonymous/cross-origin access denial, and cross-account workspace isolation.
- Published blog and changelog discovery (including older releases), draft/deleted exclusion,
  article rendering, canonical URLs, Open Graph metadata, and X large image cards.
- Public entry points, documentation, calculator/SEO tools, exports, mobile layout, and themes.

## Additional checks performed locally

- Production build, type checking, and lint passed. The final Windows typecheck used
  `pnpm typecheck --concurrency=2` to fit available memory.
- All 1,857 unit/integration tests and 12 browser tests passed, with real SQL integration
  tests enabled. Seven script tests and five deployment-boundary tests also passed.
- The existing per-package coverage gate passed for all seven packages (at least 60%
  lines/statements on each package's configured critical-file scope).
- All migrations were applied to a fresh MariaDB 10.11 database; the final database matches Prisma.
- Backup and restore were exercised against two separate isolated databases; user and migration
  counts matched. No production database was read or changed.
- Git history and the changed working-tree files were scanned with checksum-verified Gitleaks.
- The production dependency audit reported zero advisories after dependency updates.

The checks found and fixed concurrent signup deadlocks, missing first-workspace redirects,
schema drift, backup URL parsing with empty credentials, and missing Sentry runtime hooks.
Dependency updates removed the production advisories. Compiled ESM imports are now fixed
inside each package build, before Turbo caches the output, preventing cached builds from
restoring an API that Node cannot start. Unpublished policy placeholders request no indexing.

The browser harness uses the actual standalone web output, reads newly created workspaces
back through the authenticated API, and clears only its standalone runtime fetch cache between
runs so newly seeded articles are visible immediately. Published sitemap feeds use a five-minute
cache in normal operation.

## Deployment checks still needed

Local fixtures do not establish live provider readiness. Before public registrations, confirm:

- Production HTTPS origins, secure cookies, allowed origins, and real email inbox delivery.
- Reviewed policies are published in the production admin, and support destinations are staffed.
- Selected payment provider checkout, webhook delivery, entitlement changes, cancellation, and refunds.
- Real Apify account permissions and the intended Actor workflow on a controlled test Actor.
- Configured Sentry/uptime alerts actually reach their destination, and worker queues are consumed.
- Scheduled, encrypted off-site backups and a restore/rollback rehearsal on the deployment platform.

The Windows check environment has no Docker runtime, so container builds and VPS deployment
were not exercised locally. The production deployment remains unchanged by these checks.
