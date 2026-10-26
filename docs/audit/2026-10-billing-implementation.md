# Billing implementation handoff — 2026-10-26

The user explicitly authorized implementation, commits and a normal push to the scoped handoff branch after the planning-only audit. This document supersedes the original report's planning-phase disposition; the original findings/evidence remain a baseline record.

- Repository: `Coding-Frontend/actorconsole`, `/workspace/actorconsole`.
- Base: `fc52f547286b14de2f483899b4aa5dcdfca8b5ea` (initial checkout and remotely verified main baseline).
- Handoff branch: `fixes/actorconsole-20261026-billing`. The final response records the commit and verified remote SHA.
- Integration/publishing coordination remains with the architecture chat. No main push, merge, deployment, production request/data change, live payment, paid provider call, third-party bypass, real credential creation, CI change or security-setting change was performed.
- The six pre-planning candidate files were inspected and incorporated, rather than discarded or blindly staged. Historical patch/hashes remain under `evidence/billing-queues/`.

## Delivered findings

| ID | Disposition | Result and evidence |
| --- | --- | --- |
| BQ-01 | Fixed; reviewed in local tests and disposable SQL | Stripe/Razorpay/Dodo use one delivery-claim helper. Only processed deliveries return duplicate success. Failed/interrupted attempts retry; contention is retryable; timestamps fence stale completion/failure. Actual MariaDB contention/timestamp tests pass. |
| BQ-02 | Fixed | Cancellation claims and completion/rollback compare revision/state. A newer webhook is preserved on success and response loss. Ambiguous provider errors retain pending cancellation rather than authorizing a blind retry. The previously weak legacy regression now uses a successful claim/provider response and asserts that the provider was not called. |
| BQ-03 | Fixed with explicit unknown-outcome handling | Both checkout endpoints share a short, workspace-locked reservation transaction before provider I/O. Concurrent/cross-endpoint requests create at most one checkout. Reservations survive provider timeout and persistence failure. Stripe gets the supported stable idempotency key. Dodo automatic checkout retries are disabled: its installed client exposes an option but does not configure the header needed to emit it. No unsupported provider header is invented. Confirmed rejections may retry; unknown results require reconciliation. Matching verified subscription state can resolve a pending reservation. |
| BQ-04 | Fixed for the confirmed stale-event/ledger regressions | Signed subscription events retrieve current provider state, then conditionally commit only against the captured local revision/identity. An older in-flight snapshot must retry; old unlinked checkout and legacy Razorpay IDs cannot replace a newer reservation/subscription. Late failure/capture cannot overwrite a recorded refund; refund totals do not regress under stale reconciliation. No new provisional-access/settlement policy is introduced. |
| BQ-05 | Fixed | Shared provider period rules and revision/period/identity guarded expiry include omitted terminal statuses. Renewal winning after the scan prevents downgrade. The existing daily cadence is retained. |
| BQ-06 | Fixed | Payment amount/currency are validated provider metadata and use the existing shared minor-unit table. INR/USD, JPY and KWD are tested, including a real SQL KWD ledger assertion. No prices or historical financial records are changed. |
| BQ-07 | Fixed | Operational synchronization stores deduplicated run snapshots and rebuilds complete touched UTC days under an actor row lock. A bounded truncated fetch is rejected rather than published as full-day usage. Existing cost-source selection remains unchanged. |
| BQ-08 | Fixed for confirmed count loss | Failed dataset reads leave previous successful counts intact. Successful zero still replaces nonzero. New `resultCountSyncedAt` records whether a count was verified. Frontend presentation of unknown counts remains a separate seam; historical rows are not backfilled as verified zero. |
| BQ-09 | Fixed for durable bulk actor lifecycle dispatch | A timed-out Redis command no longer marks the durable operation terminally failed. API returns 202 with operation/stable job IDs and `dispatchPending`. The schedule tick redrives QUEUED intent with the same ID; SQL worker claims and terminal-state guards prevent competing jobs or replay from restarting final work. Matching request idempotency keys reuse intent; conflicting input returns 409. Real disposable Redis verifies one waiting job after repeated dispatch. Other enqueue consumers were not rewritten. |

## Schema and integration

Apply additive migration `packages/db/prisma/migrations/20261026120000_billing_operation_integrity/migration.sql` before this API/worker version. It adds `BillingCheckoutOperation`, subscription revision/reservation fields, unique workspace/request identity on bulk status operations, and dataset-count freshness. Provider I/O is outside SQL reservation/reconciliation transactions. No deployment or migration outside the disposable fixture was executed.

All **74 migrations** applied successfully to a fresh disposable MariaDB 10.11 database using cached container images. A read-only schema diff found **two existing unrelated drift statements**: `ActorOptimizationRun.approvalRequestHash` type and `BusinessProfile.isDefault` default. The same statements occur when comparing the migrated fixture to the untouched baseline schema. They were not changed, applied as a repair, or declared passed; reconcile them with the database/integration owner. No diff statement concerns the new billing fields/table.

## Validation

Final commands/results are copied into `evidence/billing-queues/implementation/`. Provider methods are mocked in every request/database test; actual Stripe/Dodo/Razorpay endpoints were never contacted.

- Focused API/provider/webhook/currency/usage/expiry/dispatch tests: **141 passed** before the final additional SQL identity cases.
- Full workspace suite: **236 suites passed, 1 skipped; 1,899 tests passed, 3 skipped** (includes all 29 enabled disposable billing SQL/Redis cases). See `test-summary.txt`. The separate existing intelligence DB suite remains skipped because its required explicit target is not configured.
- Billing integration suite: **29 local SQL/Redis cases** cover HTTP concurrency, cross-endpoint reservations, unknown provider outcomes, persistence failure, webhook-before-response, subscription ordering/version conflicts, retry/deduplication, terminal expiry/renewal races, cancellation races/unknown response, currency, payment final-state preservation, worker claims and deterministic Redis dispatch.
- All **11 package typechecks** and **11 package lint scripts** pass. Final API compile and affected-package lint also pass after the final guards.
- All **10 package builds**, including Next production build, pass; backend ESM postprocessing passes. API is recompiled after the last API guard. No application server, live checkout, or deployment was started.
- Script tests: **6 passed**.
- Gitleaks: CI-pinned **8.30.1** downloaded and checksum-verified by the repository workflow's procedure; original history scan passes with redaction. Staged diff and post-commit history scan results accompany publication.
- `git diff --check` passes. No test gate was weakened. Initial failing assertions and one resolved Stripe mock-arity mismatch are not hidden as passing runs.

Exact reproducible local run used loopback-only disposable database and Redis targets, with the existing outbound-request guard:

```sh
ACTORCONSOLE_BILLING_TEST_DATABASE_URL=mysql://root@127.0.0.1:32769/actorconsole_billing_test \
DATABASE_URL=mysql://root@127.0.0.1:32769/actorconsole_billing_test \
ACTORCONSOLE_BILLING_TEST_REDIS_URL=redis://127.0.0.1:32768 \
NODE_OPTIONS=--require=/tmp/actorconsole-billing-audit/local-only.cjs \
node node_modules/vitest/vitest.mjs run
```

These ports identify only this owned disposable fixture, not a production target; use newly assigned fixture ports on a fresh run. The integration test refuses a target unless both database environment values agree on loopback and the fixed disposable database name. It is skipped by default, and Redis coverage is separately guarded by an explicit loopback URL. The isolated containers are removed after verification. No real secret is included in these examples.

## Remaining decisions and limits

- **BQ-S1 remains decision-needed, not silently fixed:** whether unpaid completed checkout/created-authenticated subscription should grant provisional access. The optional clarification was asked; current commercial/access policy was preserved.
- **BQ-S2 was outside this batch; now confirmed and fixed in a separate follow-up:** see [the bounded publishing-lease reproduction, fix and coverage limits](2026-10-bq-s2-publishing-lease.md). The BQ-01–09 batch's historical counts above remain unchanged.
- Unknown checkout/cancellation and stuck RUNNING dispatch outcomes intentionally require reconciliation; no age-based release, blind provider create, or operator UI is added. This trades automatic retry convenience for avoiding duplicate external operations.
- No provider sandbox/browser purchase/cancel/refund acceptance flow was executed. Database tests use real isolated MariaDB/Redis and mocked providers; they do not prove external metadata propagation or merchant configuration. The integration coordinator still owns rollout and acceptance.
- Existing daily expiry timing, provisional rules, historical cost provenance, frontend unknown-count display, retention and financial settlement policies are preserved. The two unrelated schema drift statements need coordination.
- No code remains blocked by an approval denial. Publication outcome is reported from the normal push and subsequent read-only remote-ref verification, not assumed.
