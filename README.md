# ActorConsole

MIT-licensed operations tooling for Apify Actor builders: Store research, reviewable AI-assisted listing changes, publishing, usage and financial analytics.

## Repository

- `apps/web`: Next.js frontend and optional Cloudflare Pages build.
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

## Environment templates

| Template | Destination |
| --- | --- |
| `.env.example` | Root `.env`, local backend |
| `.env.web.example` | `apps/web/.env.local`, local Next.js |
| `.env.extension.example` | `apps/chrome-extension/.env.local`, public build settings |
| `.env.vps.example` | Backend server `.env.production` |
| `.env.pages.example` | Public Pages build settings |

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

## License

[MIT](LICENSE). Preserve [third-party notices](THIRD_PARTY_NOTICES.md).
