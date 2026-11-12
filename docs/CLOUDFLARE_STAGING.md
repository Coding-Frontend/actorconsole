# Cloudflare staging for ActorConsole

The staging Worker runs the Next.js frontend with OpenNext. It serves public pages and reads from the existing public API. The Worker blocks sign-in, workspace and admin pages, private API paths, and write methods. Search engines receive `noindex`.

## Frontend deployment

The **Deploy Cloudflare staging** GitHub Actions workflow publishes the current `main` revision after CI succeeds. It deploys the Worker named `actorconsole-web-staging` and verifies its revision, public pages, static assets, and API access.

Configure the GitHub environment named `cloudflare-staging` for `main`. Set its `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STAGING_URL` variables and the `CLOUDFLARE_WORKERS_API_TOKEN` secret. Use an account token with the Editor role scoped to `actorconsole-web-staging`.

For a local preview, use the repository's Node and pnpm versions and run these commands from its root.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @actorconsole/shared build
API_BASE_URL=https://api.actorconsole.com corepack pnpm --filter @actorconsole/web build:cloudflare
corepack pnpm --filter @actorconsole/web preview:cloudflare
```

## Logo storage

Use a private R2 bucket and an Object Read & Write credential scoped to it. Set the `WEBSITE_LOGO_R2_*` variables from `.env.vps.example` in the private environment for the API and worker. Keep the credential in deployment configuration.

Run the copy from the API container after building `@actorconsole/logo-catalog`. The copy keeps existing object keys and verifies every object's SHA-256 hash and length against its database record.

```bash
node_modules/.bin/tsx scripts/backfill-website-logos-r2.ts --copy
node_modules/.bin/tsx scripts/backfill-website-logos-r2.ts --verify
```

For the storage rollout, set `WEBSITE_LOGO_STORAGE_BACKEND=r2-mirror` on the API and worker to retain a filesystem copy of new logos. Run the verification again after both services restart. Use `filesystem` to return to the local volume during the transition. A deployment with a verified copy and no persistent volume can use `r2`.

## D1 rehearsal

Create a dedicated D1 database named `actorconsole-d1-staging`. Set `CLOUDFLARE_ACCOUNT_ID` and run `node scripts/rehearse-d1-staging.mjs --remote` with Wrangler authenticated for that account. The script derives SQLite DDL from the current Prisma schema, imports it into an empty staging database, and exercises it with synthetic records.

The rehearsal checks table names, payment uniqueness, foreign keys, JSON, and a retry of a background job claim. It also checks that the existing MySQL row lock and implicit support ticket numbering require application changes. Keep production application data and credentials out of this rehearsal.

Before a production cutover, port the application's transaction, money, and job behavior, then import and reconcile a representative dataset within the selected D1 plan's limits. Verify account access, payment retries, job processing, and recovery with the application connected to staging. Verify the Cloudflare runtime and rollback procedure before routing production traffic.
