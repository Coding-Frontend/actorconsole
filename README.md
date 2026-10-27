# ActorConsole

MIT-licensed operations tooling for Apify Actor builders: Store research, reviewable AI-assisted listing changes, publishing, usage and financial analytics.

## Repository

- `apps/web`: Next.js frontend.
- `apps/api`: Hono API, authentication, billing and workspace operations.
- `apps/worker`: BullMQ background processing and catalog synchronization.
- `apps/mcp`: Authenticated workspace MCP server.
- `apps/chrome-extension`: Optional browser connector built for your installation.
- `packages`: Prisma database, shared types, provider clients and configuration.

## Local setup

Use Node.js 22.12 or newer, pnpm 9.15 and Docker Compose. Run from the repository root. If you already run MySQL/MariaDB or Redis, configure those services in `.env` instead of starting containers.

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
pnpm setup:local
docker compose -f docker-compose.dev.yml up -d --wait
pnpm db:generate
pnpm db:migrate
pnpm build:backend
node scripts/fix-esm-imports.mjs apps/api/dist apps/worker/dist packages/shared/dist packages/db/dist packages/apify/dist packages/ai/dist
```

`setup:local` generates independent random authentication, admin, encryption and database credentials when creating `.env`. It creates application-specific environment files and preserves existing files. Complete missing settings in existing files yourself. Refresh `apps/worker/.env` from the root `.env` after backend changes.

Start each process in a separate terminal:

```bash
pnpm dev:api
pnpm dev:web
pnpm dev:worker
```

Open [localhost:8080](http://localhost:8080); check [API health](http://localhost:4000/health). Optional MCP requires a workspace credential; see [its README](apps/mcp/README.md).

## Authentication

The API owns email/password authentication, recovery codes and database sessions. Configure Resend or SMTP for verification/recovery email. Optional Google/GitHub sign-in uses your own Firebase project: enable providers, configure authorized domains and set matching backend `FIREBASE_PROJECT_ID` and frontend `NEXT_PUBLIC_FIREBASE_*` values.

Register, then promote your account using the backend environment:

```bash
pnpm db:seed:admin -- you@example.com
pnpm db:seed:content
```

`ADMIN_SEED_PASSWORD` optionally creates an admin password; clear it afterward. Content seeds create unpublished policy drafts. Review and publish your policies in Admin. Development FAQ/blog fixtures are excluded in production. Connect providers using your installation's credentials.

## Google Analytics

The web app can send consent-based GA4 events through its Firebase web app. Link the Firebase project to a GA4 property, enable Analytics for the web app, and set the matching `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, and `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` values from Firebase's web configuration. Set these in `apps/web/.env.local` locally and in the production web build environment; `NEXT_PUBLIC_*` settings are embedded at build time, so rebuild after changing them. The production deployment workflow reads the corresponding GitHub Actions variables. An unconfigured installation continues to work without analytics.

In the GA4 web data stream, **disable enhanced measurement**. The app sends its own page views, and GA's automatic history, form, search, and outbound-click measurements can duplicate page views or collect URLs and text outside the app's redaction. Keep other independently installed Google tags or tag managers disabled unless they implement the same consent and redaction rules. Google Analytics loads only after a visitor accepts optional analytics. The app excludes query strings and dynamic route values from its events; it does not send account details, credentials, form contents, or Actor identifiers.

Events include `page_view`, `login` (email, Google, GitHub), `sign_up` (email registration), `generate_lead` (successful contact form), `begin_checkout`, `workspace_created`, `onboarding_completed`, `apify_connected`, `actor_optimization_started`, `actor_optimization_approved`, `actor_copy_generated`, `actor_copy_applied`, `publishing_schedule_created`, `bulk_actor_operation_started`, and `financial_sync_started`. Queued events indicate that a job was accepted, not that it finished. Social sign-ins are recorded as `login`; the app does not currently distinguish new social accounts. Checkout initiation is not a confirmed purchase, so no `purchase` event is emitted.

To verify, accept the cookie banner, navigate and perform a test action, then check GA4 Realtime or DebugView. Confirm that visits with essential-only consent produce no events. See [Google's recommended events](https://developers.google.com/analytics/devguides/collection/ga4/reference/events) and [page-view settings](https://developers.google.com/analytics/devguides/collection/ga4/views) for GA4 configuration details. Route templates used for privacy are maintained in `apps/web/src/lib/analytics-path.ts`; update them when adding pages.

## Environment templates

| Template | Used for |
| --- | --- |
| `.env.example` | Root `.env` for the local API, worker, MCP and database |
| `.env.web.example` | `apps/web/.env.local` for local Next.js development |
| `.env.extension.example` | `apps/chrome-extension/.env.local` for the optional extension's public build settings |
| `.env.vps.example` | VPS `.env.production` for production Next.js, API, worker and MCP |

Local templates use localhost and development defaults. The VPS template uses production mode, container networking and HTTPS origins. Run `pnpm setup:local` for local development; use `.env.vps.example` when configuring a production server.

Real environment files are ignored by Git and Docker. `NEXT_PUBLIC_*` values are visible in browsers. Keep backend credentials and encryption keys on the backend. Provider/workspace credentials can remain encrypted in the database; see [credential handling](docs/CREDENTIALS.md).

## Checks and deployment

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:scripts
pnpm secrets:check
```

Secret scanning requires [Gitleaks](https://github.com/gitleaks/gitleaks); CI installs a checksum-verified copy. Browser tests use `E2E_BASE_URL` for staging.

See [deployment](deployment.instructions.md), [runbook](docs/RUNBOOK.md), [contributing](CONTRIBUTING.md) and [security](SECURITY.md).

See [requester address trust](docs/CLIENT_IP_TRUST.md) and [API byte limits](docs/API_DATA_BOUNDARIES.md) before configuring proxy-based requester quotas. Forwarding headers are trusted only from explicitly verified socket peers; the default trusts no proxy. API/proxy bodies are capped at 6 MiB (1 MiB for Resend), and remote logo reads enforce their byte limits while streaming.

## License

[MIT](LICENSE). Preserve [third-party notices](THIRD_PARTY_NOTICES.md).
