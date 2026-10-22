# Actor intelligence

ActorConsole now joins public Actor research with workspace operations. These additions extend the existing UI and preserve the existing Actor and creator profiles, comparison flow, billing, and publishing tools.

## Feature map

| Route                                         | Purpose                                                                                               | Data source                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `/research`, `/dashboard/research`            | Search and filter Actors; sort by users, growth, runs, rating, earnings, or newest; compare and watch | Synchronized public catalog and historical snapshots                                 |
| `/builders` and public builder/Actor profiles | Compare community portfolios and Actors using explicitly estimated monthly creator-revenue scenarios  | Public pricing and rolling usage; estimates are neither observed earnings nor profit |
| `/tools/seo`                                  | Audit a public listing and preview its search presentation                                            | Public Apify Actor listing; editorial checks, not search-rank predictions            |
| `/tools/pricing`                              | Estimate per-result revenue, profit, margin, and break-even price; export                             | Explicit manual scenario inputs                                                      |
| `/dashboard/watchlist`                        | Persist competitors, pause alerts, compare, and export                                                | Workspace watch records and synchronized catalog                                     |
| `/dashboard/profitability`                    | Combine owner financials with recorded external expenses; inspect coverage and export                 | Owner insight snapshots plus manually recorded expenses                              |

## Enable in a deployed environment

1. Follow [deployment.instructions.md](../deployment.instructions.md). Pushes to `main` deploy the CI-built Next.js, API, worker and MCP images together after CI and secret scanning pass. The VPS receiver backs up the database and applies migrations before starting the release. Backend credentials remain on the VPS.
2. Verify worker health after deployment. The worker checks watch signals after successful catalog discovery or detail synchronization and creates inbox notifications. Workspace product-notification preferences and each watch's pause setting are respected. These alerts do not send email.
3. Connect Apify and synchronize Actors. Financial coverage depends on owner analytics being available for the selected period. Public catalog usage does not imply revenue.

## Data and behavior

- The public builders landing page is a table with search and sorting, defaulting to central estimated revenue. It has no community earnings summary. Each builder row groups low, central, and high estimates with coverage; unavailable portfolios sort last in either direction. Builder profiles retain their metric rankings and add a central-revenue rank. Standalone earnings-summary containers have been removed from the overview, Actor list/details, and public builder/Actor profiles; compact per-Actor figures and leaderboard estimates remain.
- The shared earnings engine supplies compact figures in Actor lists and public profile Actor cards, comparisons, research, watchlists and CSV exports. The interactive workspace endpoint only matches that workspace's connected Actors to public, non-deprecated catalog listings. Workspace MCP credentials cannot access this interactive endpoint. Current rolling usage supplies estimates; historical charts retain their dated observations.
- Financial views use UTC dates and owner analytics covering paying-user financial activity. Profit and margin remain unavailable until both revenue and platform cost cover every selected day. External expenses include only recorded entries. Account allocations, taxes, and unrecorded expenses are excluded. An empty ledger does not establish zero external cost.
- Public creator-revenue scenarios use current public prices and 30-day usage with assumed 10%, 30%, and 70% paying fractions, 10, 100, and 1,000 billed units per paying run, and an 80% creator share. They are labelled scenarios, not measured earnings, forecasts, profit, or payout statements; platform costs, other charge events, discounts, refunds, trials, and partner terms are excluded. Incomplete pricing or usage stays unavailable, and rollups include only covered Actors. Apify retired rental pricing on 2026-10-01; stale rental records after that date are treated as unavailable.
- Trending measures growth in cumulative public users against a historical snapshot near the selected 7-, 30-, or 90-day cutoff. Actors without a usable baseline show unavailable growth. Rank watches use current public, non-deprecated catalog Actors ordered by monthly users with deterministic ties.
- Listing audits show unavailable checks when the public API does not expose the necessary documentation. Those checks are excluded from the score, and the assessed-check count is shown alongside it; a missing API field is not treated as a failed listing requirement.
- Watch alerts cover meaningful changes in user/run activity, rating, pricing, rank, and visibility. Discovery/detail synchronization must run for alerts to update; there is no independent real-time polling promise.
- Account data export includes workspace watch records and expense records and legacy operational history, while excluding credential hashes. Actor/workspace deletion cascades apply through the schema.

## Validation and local preview

`pnpm test`, `pnpm typecheck`, and `pnpm lint` cover the workspace. The opt-in integration suite exercises real database isolation, fractional manual expenses, financial coverage, public earnings coverage, and watch alert deduplication.

To run the database suite, set `ACTORCONSOLE_TEST_DATABASE_URL` and `DATABASE_URL` to the same disposable loopback MySQL/MariaDB database named `actorconsole_intelligence_test` or `actorconsole_intelligence_preview`, migrate it, and run `pnpm exec vitest run --project @actorconsole/api apps/api/test/intelligence.integration.test.ts --testTimeout 20000`. The suite refuses other database targets.

`scripts/seed-intelligence-preview.ts` creates labelled synthetic fixtures exclusively in the isolated loopback port 3308 database `actorconsole_intelligence_preview`. It rejects other targets. Set a unique `PREVIEW_SEED_PASSWORD` of at least 16 characters in the private preview environment before running it. The local preview account is `intelligence-preview@example.test`; never run this fixture seed in production.

This implementation was reviewed locally with the additive migration applied to the isolated preview database. No production migration or deployment is implied by that local validation.

## Actor SDK removal

The Actor SDK, its downloads and key administration, Monitoring, Run Rules, Runtime, and telemetry ingestion endpoints have been removed. MCP access and its workspace credentials remain supported. Apify run history and financial analytics, watchlists, research, and manual external expenses do not require the SDK and remain available. No replacement runtime instrumentation is implied by MCP.

Before deploying this removal, update any Actors that previously installed the SDK: remove the lifecycle wrapper and SDK import/file, remove their SDK secrets, and deploy their ordinary Actor work through the usual workflow. The old wrapper fails closed when its admission endpoint is unavailable, so remove it before rolling out the API removal. No Apify Actor is modified by this repository change.

Legacy SDK tables and relations are retained only for compatibility, historical account export, and account deletion cascades. There are no active SDK endpoints or background cleanup jobs. This change does not purge stored history or require a destructive database migration.
