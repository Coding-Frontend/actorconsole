# ActorConsole on Cloudflare Pages

The Git-connected `actorconsole-git` Pages project serves the frontend preview at `actorconsole-git.pages.dev`. Pages Functions runs the bundled Next.js frontend and reads from the existing public API. The preview blocks sign-in, workspace and admin pages, private API paths, and write methods. Search engines receive `noindex`.

## Frontend deployment

Cloudflare Pages builds and publishes pushes to `main` from `Coding-Frontend/actorconsole`. Preview branch builds are disabled. The build runs from the repository root with Node 22 and pnpm 9.15.0. It installs the frozen lockfile, builds `@actorconsole/shared`, and runs `@actorconsole/web`'s `build:pages` script. Pages serves `apps/web/dist-pages` with the `nodejs_compat` and `global_fetch_strictly_public` compatibility flags.

Verify the new deployment against the commit SHA shown in the Pages deployment log.

```bash
node scripts/check-cloudflare-pages.mjs https://actorconsole-git.pages.dev "$REVISION"
```

The original `actorconsole` Direct Upload project serves `cf-preview.actorconsole.com` and `actorconsole.pages.dev`. The **Deploy legacy Cloudflare Pages** workflow is available for a manual upload to this project when a Pages Edit token is configured in the `cloudflare-pages` GitHub environment.

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

## D1 rehearsal

Create a dedicated D1 database named `actorconsole-d1-staging`. Set `CLOUDFLARE_ACCOUNT_ID` and run `node scripts/rehearse-d1-staging.mjs --remote` with Wrangler authenticated for that account. The script derives SQLite DDL from the current Prisma schema, imports it into an empty staging database, and exercises it with synthetic records.

The rehearsal checks table names, payment uniqueness, foreign keys, JSON, and a retry of a background job claim. It also checks that the existing MySQL row lock and implicit support ticket numbering require application changes. Keep production application data and credentials out of this rehearsal.

Before a production cutover, port the application's transaction, money, and job behavior, then import and reconcile a representative dataset within the selected D1 plan's limits. Verify account access, payment retries, job processing, and recovery with the application connected to staging. Verify the Cloudflare runtime and rollback procedure before routing production traffic.
