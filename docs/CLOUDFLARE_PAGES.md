# ActorConsole on Cloudflare Pages

The Git-connected `actorconsole-git` Pages project serves the Next.js frontend. The Pages build serves the full app on `actorconsole.com` using the existing API at `api.actorconsole.com`. Requests for `www.actorconsole.com` redirect to the apex and preserve the path and query. On `actorconsole-git.pages.dev` and `cf-preview.actorconsole.com`, the app serves public reads, blocks account access and writes, and sets `noindex`.

## Frontend deployment

Cloudflare Pages builds and publishes pushes to `main` from `Coding-Frontend/actorconsole`. Preview branch builds are disabled. The Pages build root is `apps/web` so it loads `wrangler.json`. The build command moves to the repository root, installs the frozen lockfile with Node 22 and pnpm 9.15.0, builds `@actorconsole/shared`, and runs `@actorconsole/web`'s `build:pages` script. The output directory is `dist-pages` relative to the Pages build root.

Verify the new deployment against the commit SHA shown in the Pages deployment log.

```bash
node scripts/check-cloudflare-pages.mjs https://actorconsole-git.pages.dev "$REVISION"
```

Check `/_pages/revision` on `actorconsole.com` after cutover. Verify the sign-in page, the signed-out dashboard redirect, API health, and the redirect from `www`.

For a local preview, use the repository's Node and pnpm versions and run these commands from its root.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @actorconsole/shared build
API_BASE_URL=https://api.actorconsole.com corepack pnpm --filter @actorconsole/web build:pages
corepack pnpm --filter @actorconsole/web preview:pages
```

## Logo storage

Use a private R2 bucket and an Object Read & Write credential scoped to it. Set the `WEBSITE_LOGO_R2_*` variables from `.env.vps.example` in the private environment for the API and worker. Keep the credential in deployment configuration.

Run the copy from the API container after building `@actorconsole/logo-catalog`. The copy keeps existing object keys and verifies every object's SHA-256 hash and length against its database record.

```bash
node_modules/.bin/tsx scripts/backfill-website-logos-r2.ts --copy
node_modules/.bin/tsx scripts/backfill-website-logos-r2.ts --verify
```

For the storage rollout, set `WEBSITE_LOGO_STORAGE_BACKEND=r2-mirror` on the API and worker to retain a filesystem copy of new logos. Run the verification again after both services restart. Use `filesystem` to return to the local volume during the transition. A deployment with a verified copy and no persistent volume can use `r2`.

Production uses `r2` for website logos. The API and background worker use the private `actorconsole-website-logos` bucket. On November 14, 2026, the migration verified the byte count and SHA-256 checksum of all 3,679 database-referenced logos. The VPS volume still contains the files copied during the migration. Backfill any subsequent R2 writes to the volume before using it as the primary store.

## D1 rehearsal

Create a dedicated D1 database named `actorconsole-d1-staging`. Set `CLOUDFLARE_ACCOUNT_ID` and run `node scripts/rehearse-d1-staging.mjs --remote` with Wrangler authenticated for that account. The script derives SQLite DDL from the current Prisma schema, imports it into an empty staging database, and exercises it with synthetic records.

The rehearsal checks table names, payment uniqueness, foreign keys, JSON, and a retry of a background job claim. It also checks that the existing MySQL row lock and implicit support ticket numbering require application changes. Keep production application data and credentials out of this rehearsal.

Before a production cutover, port the application's transaction, money, and job behavior, then import and reconcile a representative dataset within the selected D1 plan's limits. Verify account access, payment retries, job processing, and recovery with the application connected to staging. Verify the Cloudflare runtime and rollback procedure before routing production traffic.

## Workers backend rehearsal

On November 14, 2026, the staging Worker used a 90-table D1 schema generated from the application and a separate private R2 bucket. The rehearsal used synthetic records. The Next.js sign-in form, session creation and deletion, public FAQ, R2 logo delivery, and queue claim and retry checks passed with staging runtime adapters.

D1 rejected Prisma interactive transactions. The first write in a Prisma batch survived a failure of the second write. A native D1 SQL batch rolled back both writes in the equivalent test. The app could read support tickets, but creating one returned HTTP 500. Checkout reservation also failed. Each flow needs a D1 implementation that preserves the existing transaction behavior.

Production uses MariaDB. The production tables and indexes occupied about 4.48 GB on the VPS, and one snapshot table held 672 MB of JSON payloads. D1 Free allows 500 MB per database. Measure the imported SQLite size and test retention and growth before selecting a production layout.

A separate Worker connected to a synthetic MariaDB instance over private Hyperdrive. It passed the job claim and retry checks, sign-in, support ticket creation, checkout reservation, and an explicit row-lock and rollback test. Cloudflare measured 58 ms of CPU for the ticket request, above the Workers Free 10 ms budget. The current native `sharp` build also failed to start in the Workers runtime. The full production API and background processor still run on the VPS. Provider integrations and continuous background processing were outside these staging checks.
