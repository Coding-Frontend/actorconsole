# Billing, usage, integrations and queue audit — 2026-10-26

## Executive assessment

**Historical baseline assessment.** Planning only controlled the original audit and no application edits were made during that phase. The user subsequently authorized implementation, commits and a scoped GitHub push; see [implementation status](2026-10-billing-implementation.md). Six earlier application/test edits remain preserved, uncommitted, in this workspace; their patch and hashes are attached. No branch, commit, push, merge, deploy, production-data operation, provider request, live payment, credential creation or security-setting change was performed.

The untouched baseline has **five recommended launch-blocking findings**: BQ-01 through BQ-05. They concern lost payment-event processing, cancellation state rollback, duplicate checkout creation, stale entitlement updates, and access remaining after recorded expiry. BQ-01 and BQ-02 have candidate local changes from the earlier implementation-authorized phase; they are **not integrated baseline fixes**. BQ-03 through BQ-05 remain untouched. BQ-06 is an additional **conditional launch blocker if non-INR Razorpay products are offered**; merchant configuration was not inspected. Three further confirmed accounting/queue issues and two suspected issues are documented below. These are recommendations based on explicit impact, not a claim that a production incident occurred.

The current edited workspace passes 1,845 tests (3 skipped), package lint, typechecks and all package builds. These passing gates do **not** cover all the newly reproduced baseline invariants. Disposable baseline fixtures intentionally fail 21 assertions across 57 tests (36 pass). No finding is merely an existing gate failure repackaged as a new vulnerability.

## Identity, instructions and state

- Repository: `https://github.com/Coding-Frontend/actorconsole.git`; checkout `/workspace/actorconsole`.
- Branch: `work`; initial and final HEAD: `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`.
- Initial worktree was clean. No local `main` ref existed. A read-only `git ls-remote origin refs/heads/main` returned that exact SHA, confirming the supplied main baseline at audit start. No product website domain was assumed or contacted.
- Read `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/RUNBOOK.md`, `docs/DODO_PAYMENTS.md`, relevant credential/provider/analytics documentation, environment **examples**, deployment/build configuration and installed provider code. Real environment values were not printed.
- No project `AGENTS.md`, `CLAUDE.md`, `.agents/skills`, progress, known-issues or launch-checklist document was found. `/workspace/.agents` and `/workspace/.codex` were empty. A dependency's `AGENTS.md` is not repository guidance. No known-issues document was available for de-duplication; the parent must reconcile IDs with other audit owners.
- Ownership: billing, usage/quotas, provider integration behavior and queue/retry/cancellation semantics. Authentication/UI/deployment/SCA-wide observations are coordination seams, not duplicate fixes in this scope.

### Earlier edits preserved separately

| File | Earlier change |
| --- | --- |
| `apps/api/src/routes/billing.ts` | Shared payment-delivery claims; conditional cancellation completion/rollback |
| `apps/api/src/routes/razorpay.ts` | Shared delivery claims/failure logging; cancellation guards |
| `apps/api/src/lib/payment-webhook-delivery.ts` | New delivery claim/lease helper |
| `apps/api/test/routes/billing.test.ts` | Webhook retry/concurrency and cancellation regression cases |
| `apps/api/test/routes/razorpay.test.ts` | Webhook retry and repeated-cancellation cases |
| `apps/api/test/lib/payment-webhook-delivery.test.ts` | New claim contention, retry and stale-owner cases |

Snapshot: [pre-planning-edits.patch](evidence/billing-queues/pre-planning-edits.patch.base64). SHA-256 manifest: [preserved-application-hashes.json](evidence/billing-queues/preserved-application-hashes.json). No reset or discard was performed. The legacy cancellation test in the preserved suite needed a stronger fixture: its default zero-row claim could mask the baseline defect. The **scratch** version sets a successful claim and provider response; it then fails on baseline. Strengthen the application regression before integration. No application test was edited after the planning-only cutoff.

## Verification and limits

| Check | Result and qualification |
| --- | --- |
| Current workspace tests | **232 suites passed, 1 skipped; 1,845 tests passed, 3 skipped**. `node node_modules/vitest/vitest.mjs run`, 67.35 s reported by Vitest. Includes the earlier edits. Isolated MySQL integration suite skipped because no explicit disposable target was configured. |
| Script tests | **6 passed**, `node --test scripts/*.test.mjs` |
| Typecheck | **11 package scripts passed** using installed `tsc`. The first generic invocation for `packages/config` was wrong and exited 1; rerunning its exact declared flags exited 0. Original result and corrected command are preserved, not hidden. |
| Lint | **11 package scripts passed**, `eslint . --max-warnings=0` per package |
| Build | **10 build scripts passed**, dependencies before apps, including Next production build; backend ESM postprocessing also passed. Build success does not establish runtime readiness or container health. |
| Provider crypto | **10 local assertions passed** against installed Stripe/Dodo SDKs and the real Razorpay HMAC helper: valid payloads accepted; missing/tampered signatures rejected; old Stripe/Dodo timestamps rejected. No SDK API request was made. |
| Augmented untouched baseline billing fixtures | **12 failed, 35 passed**: deliberately asserted safe behavior against original route source. See exact failures below. |
| Untouched worker accounting fixtures | **2 failed** |
| Untouched expiry fixtures | **6 failed, 1 passed**; `cancelled` control passes |
| Untouched queue timeout fixture | **1 failed** |
| Secret scan | **Not run**: Gitleaks is not installed. No missing gate is marked passed. |
| MySQL/Redis integration, migration rehearsal, image boot, browser purchase/refund | **Not run**; no disposable stack was provisioned in this scope. Docker CLI exists; daemon health was not assumed. No MySQL/Redis server executable was found. |
| Registry vulnerability/outdated scan | **Not run in this scope**; installed package inventory is below. Parent SCA owner must supply registry advisory/reachability analysis. |

The initial `pnpm exec` attempted package-manager bootstrap and failed with `ENOENT` creating `/home/agent/.local/share/pnpm`; this was a tool/setup failure, not an automatic approval denial. No escalation or retry around denied access occurred. Installed local binaries and `npm run build` executed the declared script equivalents; `pnpm` root orchestration itself is not claimed passed. Prisma client generation was local only, with a dummy loopback database URL; no migration/database command was run. Its tool reported loading `.env`, but no environment values were displayed or used for a database connection.

Outbound network was blocked in the later gate/fixture Node processes by [local-only.cjs](evidence/billing-queues/local-only.cjs); mocks replace network calls. This is an additional fixture restriction, not a weakened application gate. No load testing was performed: concurrency uses two mocked requests; retry and expiry use fake timers/in-memory rows.

Evidence: [gate summary](evidence/billing-queues/gate-summary.txt), [typecheck attempts](evidence/billing-queues/typecheck-results.json), [lint](evidence/billing-queues/lint-results.json), [build](evidence/billing-queues/build-results.json), [crypto](evidence/billing-queues/crypto-checks.txt). Complete raw gate logs remain under `/tmp/actorconsole-billing-audit/`.

### Reproduction commands

Run from the repository root with existing installed dependencies and locally built workspace packages:

```sh
python3 docs/audit/evidence/billing-queues/reproduce.py
NODE_OPTIONS="--require=$PWD/docs/audit/evidence/billing-queues/local-only.cjs" node docs/audit/evidence/billing-queues/crypto-checks.mjs
```

The first command archives the **recorded SHA** to a fresh `/tmp/actorconsole-billing-repro-*` directory, links existing dependencies, overlays only scratch fixtures, and runs four groups. It does not alter application source, refs, credentials or external systems. Each group exits **1 intentionally** because safe-behavior assertions reproduce the findings; logs are written into that scratch directory. Original evidence is attached as `baseline-*-red.txt`. Operational/expiry fixtures extract the original worker function/query into an importable scratch module; only imports/export wrapping change, not the audited logic. This is mocked functional evidence, not a real-database end-to-end result.

## Findings index

All source line references below are **at the recorded baseline SHA**, unless explicitly labeled current workspace. The worker and queue source remained untouched throughout.

| ID | Finding | Severity | Status | Launch blocking | Workspace disposition |
| --- | --- | --- | --- | --- | --- |
| BQ-01 | Failed/in-progress Stripe and Razorpay deliveries acknowledged as duplicates | High | CONFIRMED | Yes: required billing state can be lost permanently | Earlier candidate edits; baseline remains affected |
| BQ-02 | Cancellation request overwrites newer webhook state; legacy duplicate cancellation | High | CONFIRMED | Yes: customer cancellation state can be rolled back | Earlier candidate edits; baseline remains affected |
| BQ-03 | Concurrent and still-entitled checkouts can create a second subscription | High | CONFIRMED | Yes: duplicate provider checkout/subscription operations | Untouched |
| BQ-04 | Older subscription/payment events regress current entitlement/ledger state | High | CONFIRMED | Yes: canceled access can be restored | Untouched |
| BQ-05 | Expiry reconciliation omits terminal provider statuses | High | CONFIRMED | Yes: recorded period ends without removing access | Untouched |
| BQ-06 | Razorpay ledger forces INR/two decimal units | Medium | CONFIRMED | Conditional: non-INR offering | Untouched |
| BQ-07 | Incremental sync overwrites full-day totals with a partial day | Medium | CONFIRMED | No security release block; financial-analytics readiness gap | Untouched |
| BQ-08 | Dataset read outage overwrites known result counts with zero | Medium | CONFIRMED | No; reporting integrity gap | Untouched |
| BQ-09 | Timed-out enqueue may execute after API marks it failed | Medium | CONFIRMED | No automatic security block; requires durable outcome handling | Untouched |
| BQ-S1 | Entitlement granted before confirmed payment/activation | Unrated | SUSPECTED policy mismatch | Undetermined; requires explicit product policy | Preserved behavior |
| BQ-S2 | Publishing operation can outlive its distributed lock | Medium candidate | SUSPECTED | Undetermined; no runtime overlap reproduction | Untouched |

### BQ-01 — delivery acknowledgement loses recovery

**Reachable path:** public signed `POST /billing/webhooks/stripe` at `apps/api/src/routes/billing.ts:300` calls `webhookSeen` before processing. Any row, including `failed` or interrupted `received`, returns HTTP 200 `{ok:true,duplicate:true}`. `POST /razorpay/webhook` has the same unconditional existing-row return at `apps/api/src/routes/razorpay.ts:307`; processing errors are not wrapped to mark failed. Public mounting/signature boundaries are in `apps/api/src/app.ts:166` and `:182`.

**Reproduction:** baseline fixture `retries Stripe processing after a failed delivery instead of acknowledging it` injects one database failure in `invoice.payment_failed`, then retries the event. First request returns **500**; retry returns **200**, but payment update call count is **1, expected 2**. A fresh `received` Stripe row returns **200, expected retryable 503**. Failed Razorpay row returns 200 without any payment update (**0, expected 1**). See [billing failures](evidence/billing-queues/baseline-billing-red.txt). Command: reproduction script, `billing` group; direct original command was `node .../vitest.mjs run apps/api/test/routes/billing.test.ts apps/api/test/routes/razorpay.test.ts` in the scratch baseline.

**Impact and plan:** a transient outage or process interruption can permanently drop payment/access updates after the provider sees success. Claim only unprocessed work atomically; acknowledge processed deliveries only; preserve retryable responses under contention. Fence completion/failure by attempt ownership. Current helper at `apps/api/src/lib/payment-webhook-delivery.ts:12` and three route changes implement candidate recovery. Six ownership tests and full gates pass; real MySQL contention/precision remain untested. Not an exactly-once guarantee for side effects: event ordering and reconstruction still require BQ-04.

### BQ-02 — cancellation loses concurrent state

**Reachable path:** authenticated `POST /billing/cancel`, baseline `apps/api/src/routes/billing.ts:254` through `:264`, performs a provider call then unconditionally updates the same subscription by ID. On error it restores the pre-call status. `apps/api/src/routes/razorpay.ts:220` through `:276` similarly rolls back/completes without a state guard; its initial check ignores `cancelAtPeriodEnd`.

**Reproduction:** while the mocked provider call is pending, a fixture applies webhook state `canceled` with `cancelAtPeriodEnd:true`. Both successful-response (**HTTP 200**) and lost-response (**HTTP 502**) paths leave baseline status **active, expected canceled**. A strengthened scratch legacy fixture with `cancelAtPeriodEnd:true` and a successful claim returns **200, expected 409**, and reaches the cancellation SDK mock. Exact assertions are in the billing failure attachment.

**Impact and plan:** a provider cancellation webhook can be overwritten by stale request state, or an already-scheduled cancellation submitted again. Conditional claims/completion/rollback are present in earlier local edits at current `billing.ts:248` and `razorpay.ts:234`. Provider success followed by DB-write failure must not revert to active. Still review ambiguous provider timeouts and crash recovery explicitly; no live provider behavior was tested. No change to period-end access policy is proposed.

### BQ-03 — duplicate checkout/provider operations

**Reachable path:** baseline `apps/api/src/routes/billing.ts:94` reads the subscription, `:155` calls the provider, `:183` persists afterward. There is no durable atomic reservation/idempotency key across that gap. The legacy path at `apps/api/src/routes/razorpay.ts:96`, `:148`, `:161` follows the same pattern. Neutral `ACTIVE_STATUSES` at `billing.ts:33` omits `past_due`, while `:508` explicitly treats that status as entitled. Legacy active-status lists at `razorpay.ts:101`, `:120`, `:134` also omit `on_hold`, cancellation-pending and other still-owned states.

**Reproduction:** two concurrent mocked `POST /billing/checkout` requests with `{gateway:"stripe",plan:"PRO",interval:"month"}` both return **200**; `createProviderCheckout` is called **2 times, expected 1**. With an existing Stripe `past_due` subscription, one request returns **200, expected 409**. These failures remain in untouched code after the earlier edits. No actual provider checkout was created.

**Impact and plan:** local upsert/uniqueness after an external side effect cannot prevent multiple provider checkouts/subscriptions; the overwritten local reference can hide one. Actual double collection was **not** tested. Implement a shared durable operation/reservation for both endpoints, provider-supported idempotency where verified, and reconciliation for uncertain outcomes. Do not hold a SQL transaction open during network calls or automatically discard an ambiguous reservation. Define the allowed existing-subscription state transition without inventing pricing or settlement rules.

### BQ-04 — event ordering regresses state

**Reachable path:** `apps/api/src/routes/billing.ts:479` through `:540` applies Stripe subscription state without checking `event.created` or reconciling current provider state. Workspace guard at `:938` checks provider/mode/IDs, not event version for the **same** subscription. Dodo failure processing at `:806` overwrites any matching payment status with `failed`; Stripe invoice failure at `:584` also lacks a current-status guard. New delivery IDs do not establish a newer business event.

**Reproduction:** an existing `sub_1` is locally canceled. A distinct signed-event fixture with `created:1`, `customer.subscription.updated`, same ID, `status:"active"` returns **200** and writes **plan PRO**, failing the assertion that canceled access must remain unchanged. Two Dodo fixtures start from `captured` and `refunded`; a late `payment.failed` returns 200 and overwrites each with **failed**. See billing failure attachment. Signatures are mocked in these route fixtures; separate real-SDK crypto tests validate signature boundaries.

**Impact and plan:** legitimate delayed delivery or a replay with a new delivery identity can restore revoked access or regress a final ledger record. Reconcile an authoritative current provider object, or persist a verified provider-specific ordering/version strategy, before atomically applying state. A bare timestamp check alone is insufficient for all providers/equal timestamps. Preserve the existing financial policy; refund eligibility and grace periods require product approval. BQ-01 delivery leases do not solve ordering.

### BQ-05 — terminal entitlement never expires

**Reachable path:** baseline `billing.ts:506` and `:632` retain Pro until a future period end for several terminal statuses. The worker at `apps/worker/src/index.ts:2409` through `:2430` later queries only manual active rows or statuses **`cancelled`/`completed`**. Stripe uses **`canceled`**, and Stripe `unpaid`/`incomplete_expired`/`paused`, plus Dodo `failed`/`expired`, are omitted. `apps/api/src/lib/business-profile.ts:87` takes `plan` from the workspace; `apps/api/src/lib/plan-access.ts:157` allows Pro without reevaluating subscription expiry.

**Reproduction:** the extracted unchanged expiry query runs against in-memory rows whose `currentPeriodEnd` is past. **6 of 7 fixtures fail**: the six omitted statuses retain **PRO, expected FREE**. Dodo `cancelled` is the passing control. See [expiry failures](evidence/billing-queues/baseline-expiry-red.txt), reproduction script `expiry` group. This tests the actual selection/update logic, not a real SQL database.

**Impact and plan:** after the recorded period ends, Pro access can persist indefinitely if no later provider event corrects it. Share the existing entitlement-expiry predicate between ingestion and scheduled reconciliation. Re-read/conditionally update the same provider subscription, status and period inside the transaction so a renewal or replacement cannot be downgraded from a stale scan. Improve reconciliation frequency separately; the current daily interval itself can leave up to a day of drift. Do not invent a new grace period.

### BQ-06 — provider currency is discarded

**Reachable path:** baseline `apps/api/src/routes/razorpay.ts:436` stores `p.amount / 100` and `:437` hardcodes `currency:"INR"`. The admin product path accepts/imports other provider currencies at `apps/api/src/lib/billing-providers.ts:420` and `:498`. This is an inconsistency in supported data handling, not client-controlled pricing.

**Reproduction:** a signed-event fixture for `subscription.charged` carries provider `amount:12345,currency:"KWD"`. HTTP **200** records **123.45 INR**, while the fixture expects **12.345 KWD**. See exact upsert diff in billing failure attachment. Provider support/configuration of a particular merchant was not contacted or assumed.

**Impact and plan:** wrong ledger denomination and exponent for non-INR payments. Use the provider currency and a tested shared minor-unit conversion; test zero-, two- and three-decimal currencies and invalid data. Do not rewrite historical financial data without a separately reviewed reconciliation plan. Conditional launch block applies only if affected products are offered; no statement that an actual charge occurred.

### BQ-07 — partial-window accounting replaces a full day

**Reachable path:** `apps/worker/src/index.ts:1864` starts incremental history at `lastRunSyncAt - 24h`, usually mid-day. The run subset is bucketed by UTC day and `:1956` through `:1978` replaces whole-day counts and usage costs with those partial buckets. Called from `runSnapshot` at `:1304` and six-hour usage synchronization at `:1819`/`:2393`.

**Reproduction:** fixtures contain two prior-day runs at 06:00/18:00 and one current-day run. First sync records prior-day **2 runs, $3 cost, 5 results**. After advancing sync time and rerunning unchanged source, the same row becomes **1 run, $2, 3 results**. Safe-behavior assertion fails. See [usage failures](evidence/billing-queues/baseline-usage-red.txt), reproduction script `usage` group.

**Impact and plan:** normal repeated synchronization corrupts previously complete analytics. Rebuild touched days from persisted deduplicated run snapshots, or fetch complete UTC days with an explicit completeness check; do not upsert an incomplete capped page as a full day. Keep billing-vs-run cost provenance explicit rather than inventing a financial source-of-truth policy. No production data was read or repaired.

### BQ-08 — transient errors become fabricated zero counts

**Reachable path:** `apps/worker/src/index.ts:1888` through `:1893` catches dataset read errors and returns zero; `:1949` overwrites the run snapshot, then `:1978` overwrites daily results.

**Reproduction:** first sync stores a known current-day result count **4**. On the next sync, only `getDatasetItemCount` rejects with a temporary upstream error. Stored daily count becomes **0, expected 4**. Second assertion in the usage failure attachment fails.

**Impact and plan:** provider unavailability is misreported as zero output. Distinguish unknown from an actual empty dataset; retain the previous successful snapshot count and retry the failed read. True successful zero must still replace older nonzero data. Test both cases and an initial run whose count is unknown.

### BQ-09 — an enqueue timeout is treated as definite failure

**Reachable path:** `apps/api/src/lib/queue.ts:8` rejects after 1,500 ms while leaving the underlying `queue.add` pending (`:116`). `apps/api/src/routes/bulk-publishing.ts:452` marks the operation/items definitively FAILED and returns 503. Worker `apps/worker/src/index.ts:694` loads by ownership but does not reject failed operation state; `:727` resets non-successful items to QUEUED and `:736` runs the operation.

**Reproduction:** an in-memory queue accepts at fake time 1,600 ms. `enqueue` has already returned **Error("Redis command timed out")** at 1,500 ms. The assertion that rejected submission has not been accepted fails (**true, expected false**). See [queue failure](evidence/billing-queues/baseline-queue-red.txt), reproduction script `queue` group. No real Redis or actor mutation occurred. The worker/route continuation is verified from the cited reachable source, not a full-stack execution.

**Impact and plan:** a caller receives apparent failure while its status mutation can still execute; a manual retry can create another operation. Treat the result as **unknown**, use a stable operation/job ID and durable outbox/reservation, and reconcile worker acceptance. Do not claim that timing out a JavaScript promise can cancel a Redis write.

## Suspected / policy-dependent items

- **BQ-S1:** baseline `billing.ts:479` unconditionally grants Pro on `checkout.session.completed`, including non-paid sessions; `razorpay.ts:354` through `:394` grants Pro for created/authenticated as well as activated subscription events. Payment/activation semantics could permit trials or provisional access. Source behavior is confirmed; whether it violates intended entitlement policy is **SUSPECTED**, not a proven exploit. Obtain the exact policy; do not invent prices, settlement, refunds or grace rules.
- **BQ-S2:** `apps/worker/src/index.ts:867` holds a one-hour publishing lock with no renewal; multiple validation runs can each wait up to 900 s (`apps/worker/src/lib/bulk-publishing.ts:23`). Another forced job may acquire after expiry while the original remains active. No long-running overlap test was performed. Verify with a bounded fake-clock fixture before assigning confirmed severity; no load test is needed.

## Verified sound within the tested limits

- Checkout body restricts gateway/Pro/month-or-year and rejects extra price fields (`billing.ts:24`); enabled gateway/readiness and selected configured product checks precede provider checkout. Existing route tests exercise missing interval, invalid interval, disabled/unconfigured gateway and product mismatch.
- Billing/legacy routes require authentication, workspace resolution and interactive sessions; only signed webhook paths are public (`app.ts:166`–`:196`). This verifies mounting, not every authentication implementation detail; auth owner retains that review.
- Stripe mode is checked against `event.livemode`; persisted provider/mode/subscription identity guards reject other-mode and replaced-subscription events. Existing tests cover test/live and old Dodo IDs. **Same-ID ordering remains BQ-04.**
- Real SDK signature checks: Stripe installed `node_modules/stripe/esm/Webhooks.js:169` uses secure comparison and `:197` enforces timestamp tolerance. Dodo installed `node_modules/dodopayments/resources/webhooks/webhooks.mjs:94` invokes verification because the route always passes headers; `node_modules/standardwebhooks/dist/index.js:47` checks required headers/signature and `:108` checks time. The SDK's no-headers bypass is not used by the route. Ten local crypto assertions pass. Razorpay helper rejects missing/tampered HMACs; no claim of formal timing analysis of its JavaScript comparison loop is made.
- Payment and webhook database unique keys exist (`packages/db/prisma/schema.prisma:300`, `:1275`); these prevent duplicate local IDs, **not** duplicate external checkout calls or stale business state.
- Free thresholds are strictly greater than 50 actors/500 monthly users; exact limits remain valid (`packages/shared/src/plans.ts:19`). API/worker plan tests verify limits, stale usage refresh, retained cached audience and Pro availability during reporting outages. Unknown-usage policy is not newly restricted.
- Workspace actor admission deduplicates IDs, scopes by owner/workspace and uses parameterized `Prisma.sql` plus `FOR UPDATE` (`packages/db/src/workspace-actor-import.ts:25`–`:37`). Real database lock contention was not exercised.
- Shared queue retry/backoff defaults are consumed by API and worker. Leader lock release uses compare-and-delete Lua ownership (`apps/worker/src/lib/leader-election.ts:38`); its existing tests pass. No proof is claimed for every long-running side effect.
- Dodo refund processing reconciles current provider refunds instead of adding an event twice (`billing.ts:815` baseline); existing tests protect a refunded row from a later **success** event. That gate has a hole for later **failure** events, reproduced in BQ-04.
- Installed BullMQ 5.81.5 `dist/esm/classes/job.js:1070` permits its legacy three-part colon-ID compatibility case. Existing two-colon IDs were **not** falsely reported as universally invalid based on memory of another version.

## Scoped SCA inventory and configuration review

Installed versions/licenses/scripts are recorded in [installed-scope-packages.json](evidence/billing-queues/installed-scope-packages.json): Stripe 22.4.0 (MIT), Razorpay 2.9.8 (MIT), Dodo 2.55.0 (Apache-2.0), standardwebhooks 1.1.1 (MIT), BullMQ 5.81.5 (MIT), ioredis 5.11.1 (MIT), apify-client 2.25.0 (Apache-2.0), socket.io-client 4.8.4 (MIT), Resend 6.34.1 (MIT), Nodemailer 7.0.7 (MIT-0), OpenAI 6.49.0 (Apache-2.0), Google GenAI 2.31.0 (Apache-2.0), Zod 4.6.7 (MIT), Prisma client 6.19.3 (Apache-2.0). Listed direct payment/queue clients have no install lifecycle script. GenAI has an echo-only preinstall; Prisma client runs its generator postinstall. This selected inventory is **not** a full transitive license/advisory attestation.

Scoped environment reads include `REDIS_URL`, `APP_ENCRYPTION_KEY`, optional `APIFY_API_TOKEN`, worker concurrency/delay controls and provider settings through the integration catalog. `.env.example`/`.env.vps.example` document mode-scoped billing settings and localhost/example origins. No real environment values were enumerated. Registry `audit`/`outdated`, lockfile-install integrity, container layers, all application environment reads and all fetch destinations require the parent SCA/config owners' consolidated report. No package/security setting was changed and no advisory-free claim is made.

## Readiness, operational gaps and coordination

- Provider sandbox purchase/cancel/refund golden paths are **pending user verification**: use merchant test mode only, one disposable workspace, configured product/interval, sandbox checkout, signed provider delivery, and verify exactly one subscription/payment plus matching entitlement. Then cancel, redeliver and reorder events; verify reconciliation after the recorded period. This audit sent **zero** provider requests.
- Empty-database migrations, production container build/boot, health/browser auth matrices, backups/restore rehearsal, uptime monitoring and retention of real operational logs are **untested here**. Existing runbook is a claim to validate, not proof of successful operations.
- Concrete schedules from worker source: usage sync immediately on boot then every **6 hours** (`index.ts:2393`); retention/expiry immediately then **daily** (`:2440`); actor snapshots **02:00 UTC**, store search **01:00 UTC**, detail sync **hourly at :15**, website classification **03:30 UTC**, logo enrichment **04:00 UTC** (`:2086` onward). These are workers, not public cron URLs. Payment webhook route paths are `/billing/webhooks/stripe`, `/billing/webhooks/dodo`, `/razorpay/webhook`, with `?mode=test` for an explicit sandbox; deployment origin must be resolved by its owner.
- Parent auth owner: reconcile only the billing mount/workspace seam. This report makes no claims about recovery-code/session/key-scope flaws and does not duplicate the UI Enter-key 2FA issue.
- Parent analytics/UI owner: coordinate BQ-07/BQ-08 display of missing vs zero and partial coverage; own fixes remain in worker accounting, without a UI rewrite.
- Parent database/ops owner: coordinate BQ-01 lease atomicity and BQ-03/BQ-09 outbox migrations and cleanup; do not independently alter the same subscription/operation schema.
- Residual risks are **documented, not accepted by the user**: unintegrated candidate patches, remaining confirmed findings, policy-dependent entitlement rules, untested real DB/Redis/provider behavior and skipped security/readiness gates. No capacity/environment failure remains blocking report generation. No action was denied by automatic approval review, and no permission request or external operation is pending/uncertain.

Remediation sequencing and exact regression requirements: [billing-queues-remediation.md](../plans/billing-queues-remediation.md).

Exact final changed-file inventory, including every evidence deliverable: [workspace-changed-files.txt](evidence/billing-queues/workspace-changed-files.txt).

The historical patch is stored byte-for-byte as Base64 to preserve unified-diff blank context markers while passing whitespace checks. Decode `evidence/billing-queues/pre-planning-edits.patch.base64` to recover the original patch; the raw copy also remains at `/workspace/audit-artifacts/billing-queues/pre-planning-edits.patch`.
