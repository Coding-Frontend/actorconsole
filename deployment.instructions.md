# Self hosted deployment

Use your own server, MySQL/MariaDB database, provider accounts and domains. API, worker, MCP and Redis run with Compose; host the frontend on Pages or Next.js.

## Backend

Copy `.env.vps.example` to private server-side `.env.production` (`chmod 600` on Linux). Configure database/Redis URLs, `AUTH_URL`, `CORS_ORIGINS`, `SUPPORT_EMAIL`, provider credentials and independent random `AUTH_SECRET`, `ADMIN_API_KEY`, `APP_ENCRYPTION_KEY`. Generate each separately with `openssl rand -hex 32`. Preserve an existing encryption key when moving configuration.

Set `MCP_API_BASE_URL` to your public HTTPS API origin. Hosted MCP uses each caller's workspace credential. Keep database/Redis private. Compose publishes API/MCP on loopback; configure HTTPS, DNS and reverse proxy yourself. Nginx files in `.deploy/` use example domains.

```bash
docker compose --env-file .env.production -f docker-compose.vps.yml build
docker compose --env-file .env.production -f docker-compose.vps.yml run --rm api node node_modules/.bin/prisma migrate deploy --schema packages/db/prisma/schema.prisma
docker compose --env-file .env.production -f docker-compose.vps.yml run --rm api node_modules/.bin/tsx scripts/seed-policies.ts
docker compose --env-file .env.production -f docker-compose.vps.yml up -d
```

Review draft policies before publishing in Admin. Preserve database, Redis and logo asset volumes across releases.

## Frontend

For Pages, fill `.env.pages.example` with your HTTPS site/API origins and public Firebase settings; save as ignored `.env.pages.local`.

```bash
node scripts/build-pages.mjs --env-file .env.pages.local
# Install Wrangler and authenticate to your own Cloudflare account first:
wrangler pages deploy apps/web/dist-pages --project-name YOUR_PAGES_PROJECT
```

Never upload backend environment files. Retain generated `_worker.js` and `_routes.json`; the bounded Worker serves anonymous detail pages and legacy device compatibility. Node owns authentication and business logic.

Asset retention is opt-in: set `PAGES_RETAIN_FROM` to comma-separated HTTPS origins you control or pass `--retain-from ORIGIN`. No existing ActorConsole installation is contacted by default. Use `--local-preview` for the local static preview configuration.

For optional Next.js hosting, configure `.env.vercel.example`. `API_BASE_URL` is the server-side backend origin; browsers use the same-origin `/api` proxy. All backend credentials stay on the backend; Sentry upload tokens belong in the build environment.

For the extension, copy `.env.extension.example` to `apps/chrome-extension/.env.local`, set origins and run `pnpm --filter @actorconsole/chrome-extension build`. JavaScript and manifest permissions follow those settings. Publish your own binary/listing and configure `NEXT_PUBLIC_CHROME_EXTENSION_URL` if needed.

## Optional automation

CI uses synthetic credentials. Container publication is opt-in through `ENABLE_CONTAINER_RELEASES=true` or manual dispatch.

The separate backend deployment workflow is manual. Create a protected GitHub `production` environment with required reviewers. Set `ENABLE_VPS_CD=true`, variables `VPS_HOST`, `VPS_USER`, and protected secrets `VPS_SSH_PRIVATE_KEY`, `VPS_SSH_KNOWN_HOSTS` (an independently verified host entry).

Use a dedicated deployment account and restricted key. Install `.deploy/actorconsole-deploy` as its forced SSH command. The receiver accepts a full commit SHA and an archive on stdin. Server-side `ACTORCONSOLE_DEPLOY_ROOT` and `ACTORCONSOLE_COMPOSE_PROJECT` override defaults. Keep backend secrets in `shared/.env.production`. Manually select a full SHA that passed CI.

Back up before migrations and verify `/health/ready`, login, queues and a scoped workspace request after release. See [the runbook](docs/RUNBOOK.md).
