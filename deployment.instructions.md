# Self hosted deployment

Use your own server, MySQL/MariaDB database, provider accounts and domains. Next.js, API, worker, MCP and Redis run with Compose on the VPS. MySQL/MariaDB remains on the database host configured in the private server environment.

## Production environment

Copy `.env.vps.example` to private server-side `.env.production` (`chmod 600` on Linux). Configure database/Redis URLs, `AUTH_URL`, `CORS_ORIGINS`, `SUPPORT_EMAIL`, provider credentials and independent random `AUTH_SECRET`, `ADMIN_API_KEY`, `APP_ENCRYPTION_KEY`. Generate each separately with `openssl rand -hex 32`. Preserve an existing encryption key when moving configuration.

Set `MCP_API_BASE_URL` to your public HTTPS API origin. Hosted MCP uses each caller's workspace credential. Keep database/Redis private. Compose publishes API/MCP on loopback; configure HTTPS, DNS and reverse proxy yourself. Nginx files in `.deploy/` use example domains.

```bash
docker compose --env-file .env.production -f docker-compose.vps.yml build
docker compose --env-file .env.production -f docker-compose.vps.yml run --rm api node_modules/.bin/prisma migrate deploy --schema packages/db/prisma/schema.prisma
docker compose --env-file .env.production -f docker-compose.vps.yml run --rm api node_modules/.bin/tsx scripts/seed-policies.ts
docker compose --env-file .env.production -f docker-compose.vps.yml up -d
```

Review draft policies before publishing in Admin. Preserve database, Redis and logo asset volumes across releases.

## VPS Next.js frontend

The `web` service starts with the backend stack and listens on loopback port 4202 by default. It uses the standalone Next.js image as a non-root user. Only public browser configuration enters the build; runtime API calls use `WEB_API_BASE_URL=http://api:4000`. Backend database, encryption, mail and provider secrets are not passed to the web container.

Use `.deploy/nginx-web.conf` as a bootstrap template, retain existing TLS certificate settings, and proxy the web hostname to `127.0.0.1:4202`. Verify `/api/health` and the backend `/health/ready` before changing DNS.

## Optional Chrome extension

For the extension, copy `.env.extension.example` to `apps/chrome-extension/.env.local`, set origins and run `pnpm --filter @actorconsole/chrome-extension build`. JavaScript and manifest permissions follow those settings. Publish your own binary/listing and configure `NEXT_PUBLIC_CHROME_EXTENSION_URL` if needed.

## Optional automation

CI uses synthetic credentials. Container publication is opt-in through `ENABLE_CONTAINER_RELEASES=true` or manual dispatch.

The **Deploy VPS** workflow runs after a successful CI push to `main`; it also checks the matching **Secret scan** result. Fork PRs and superseded automatic revisions cannot deploy. Manual dispatch accepts only a commit on `main` with successful CI and secret scanning.

Create a GitHub `production` environment restricted to the `main` branch. Set repository variable `ENABLE_VPS_CD=true`, variables `VPS_HOST`, `VPS_USER`, and protected environment secrets `VPS_SSH_PRIVATE_KEY`, `VPS_SSH_KNOWN_HOSTS`. Use a dedicated SSH key restricted to the forced command `.deploy/actorconsole-deploy`. Never put the server's general SSH key in GitHub.

Install `.deploy/actorconsole-deploy` as `/usr/local/sbin/actorconsole-deploy` and `.deploy/verify-vps-bundle.py` as `/usr/local/lib/actorconsole/verify-vps-bundle.py`, owned by root with mode `700`. Review updates to these trusted entry points separately from application releases. Restrict the key in `authorized_keys` with `restrict,command="/usr/local/sbin/actorconsole-deploy"`.

Set these public production environment variables for the image build: `NEXT_PUBLIC_SITE_URL` and the `NEXT_PUBLIC_FIREBASE_*` values from your own installation. `NEXT_PUBLIC_CHROME_EXTENSION_URL` is optional. Set `VERIFY_PUBLIC_WEB=true` after the hostname points to this VPS to enable the external revision probe.

Images for API, worker, MCP and Next.js are built in GitHub Actions. The release contains source plus a compressed image archive, a full revision, SHA-256 checksums and image revision labels. The forced-command receiver validates the bundle, requires at least 4 GiB free space, loads the prebuilt images, backs up the database, applies migrations, starts the services and verifies API/web readiness. It does not build images on the VPS. The previous application's images are retained for rollback; other projects and data volumes are untouched.

Keep backend secrets in `shared/.env.production`. Preserve `APP_ENCRYPTION_KEY` and existing database credentials. The receiver switches `current` only after the running web revision matches the release. Application rollback does not undo database migrations; restoring a database is a separate, explicitly reviewed maintenance operation.

Use the [runbook](docs/RUNBOOK.md) to check login, queues, public pages and scoped workspace requests after release. Keep the previous frontend available until the VPS origin and DNS cutover are verified.
