# Billing and queue remediation plan

> Integration note: selected source/tests, the additive migration and concise reports are imported from verified owner `ac5649bf6cdec57c0d0754687f47edf0b86ad6ed`. Bulk logs, JSON and scratch fixtures remain on the [owner evidence branch](https://github.com/Coding-Frontend/actorconsole/tree/ac5649bf6cdec57c0d0754687f47edf0b86ad6ed/docs/audit/evidence/billing-queues/). Owner counts below are independent; [the integration record](../audit/2026-10-integration.md) records combined verification. BQ-S1 and BQ-S2 are not resolved. No deployment or production migration is authorized.

Status: **historical remediation plan; implementation subsequently authorized by the user on 2026-10-26**. See [implementation status](../audit/2026-10-billing-implementation.md) for the delivered batch, consolidated migration and validation. The plan itself authorizes no production effect or financial-policy change. Base: `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`, branch `work`. See [audit and evidence](../audit/2026-10-billing-queues-audit.md).

Each phase is intended to fit one focused implementation session. Run the regression first against the recorded baseline, then the fix, then appropriate typecheck/lint/tests/build. Keep requests mocked and databases disposable. Never change a gate to turn a finding green.

## Phase 0 — review preserved candidate work (BQ-01, BQ-02; launch blocking)

Exact existing files:

- `apps/api/src/lib/payment-webhook-delivery.ts`
- `apps/api/src/routes/billing.ts`
- `apps/api/src/routes/razorpay.ts`
- `apps/api/test/lib/payment-webhook-delivery.test.ts`
- `apps/api/test/routes/billing.test.ts`
- `apps/api/test/routes/razorpay.test.ts`

Start by comparing these six files with [the preserved patch](https://github.com/Coding-Frontend/actorconsole/tree/ac5649bf6cdec57c0d0754687f47edf0b86ad6ed/docs/audit/evidence/billing-queues/pre-planning-edits.patch.base64) and hashes; do not discard or recreate them blindly. **Migration: no** for the existing claim/lease design; `WebhookDelivery.attemptedAt` and unique source/externalId already exist.

Regression first:

1. Keep the failed Stripe/Razorpay redelivery, active-delivery 503, two simultaneous initial deliveries, two simultaneous failed retries, stale recovery, immediate same-millisecond retry, and stale-owner completion/failure assertions.
2. Strengthen the legacy repeated-cancellation test: use a successful `updateMany` claim and a provider response. On baseline, `cancelAtPeriodEnd:true,status:active` must reach the fake provider and fail the expected 409 assertion; the current preserved test's default count-zero could mask this.
3. Add legacy cancellation callback races matching the neutral route: webhook changes state during both provider success and thrown/lost response. Verify exact status/flags remain the webhook's state.
4. Add provider success followed by local DB failure; do not restore pre-cancellation active state. Keep unknown provider outcome distinguishable from a confirmed rejection; do not automatically call cancellation again after an ambiguous timeout.
5. Add bounded disposable MySQL checks for concurrent claim ownership and actual timestamp precision. Do not claim in-memory mocks prove SQL semantics.

Review and complete the candidate shared claim implementation: only processed deliveries are duplicate successes; failed/interrupted rows can be atomically reclaimed; fresh contention stays retryable; completion/failure are fenced to the current lease. Candidate cancellation writes must be conditional on the claim and must not overwrite a newer webhook. Preserve both endpoint response shapes and existing access-period policy. Do not expand these edits into formatting other routes.

Verification: focused 47-test suite plus strengthened cases, API typecheck/lint, then full workspace tests/build. Docs: update `docs/DODO_PAYMENTS.md` with provider-neutral redelivery/recovery behavior and `docs/RUNBOOK.md` with stuck/unknown cancellation and webhook reconciliation steps. This phase does not solve BQ-04 ordering.

## Phase 1 — reserve checkout durably (BQ-03; launch blocking)

Exact planned files:

- New `apps/api/src/lib/billing-checkout-operations.ts`
- `apps/api/src/routes/billing.ts`
- `apps/api/src/routes/razorpay.ts`
- `apps/api/src/lib/billing-providers.ts`
- `packages/db/prisma/schema.prisma`
- New `packages/db/prisma/migrations/20261026120000_billing_checkout_operations/migration.sql`
- New `apps/api/test/lib/billing-checkout-operations.test.ts`
- `apps/api/test/routes/billing.test.ts`, `apps/api/test/routes/razorpay.test.ts`
- `apps/api/test/lib/billing-providers.test.ts`

**Migration: yes**, additive operation/reservation state; test migration only on an empty disposable DB. Coordinate this schema with the database owner before implementation.

Regression first: two simultaneous checkout requests for one workspace call a provider **at most once**; race neutral vs legacy endpoints, different gateways, and different intervals. Still-entitled `past_due` and legacy `on_hold`/cancellation-pending states cannot silently replace their provider subscription. Same-operation retries return the saved checkout; another workspace remains independent. Force a provider success followed by a database error and a provider timeout after simulated acceptance; neither permits a blind second create.

Implement one shared operation flow for both endpoints:

1. Persist a workspace-scoped operation reservation before the network boundary, in a short transaction/atomic claim. Include immutable operation ID, provider/mode/product/interval, request key, state, attempt/version and returned remote IDs/URL. Enforce one unresolved checkout operation per workspace across gateways/endpoints; preserve historical attempts separately if required by the chosen table layout.
2. Use an explicit state machine: reserved/in progress, succeeded, confirmed failed, unknown. A provider timeout, disconnect or persistence failure after possible remote acceptance is unknown, not a reusable empty slot. A concurrent caller must observe the existing operation rather than making another provider create.
3. Pass the stable operation key only through the provider's **verified supported** idempotency option. Inspect installed SDK code/types; do not invent Razorpay or Dodo headers. If a provider cannot deduplicate creates, require reconciliation of unknown outcome before releasing a reservation.
4. Persist provider result with ownership/version guards. A webhook may arrive before the checkout response; completion must not overwrite newer state or erase provider identifiers.
5. Reuse/clarify one existing-subscription state predicate across neutral/legacy routes. Retain current billing rules; obtain product approval for uncertain terminal/grace transitions.

Do not hold SQL row locks across provider calls. Do not add an automatic TTL that makes an unknown checkout eligible for a second charge. Verify with mocks and two bounded disposable transactions. Docs: operation/unknown-outcome reconciliation in `docs/RUNBOOK.md`; supported sandbox checkout recovery in `docs/DODO_PAYMENTS.md`. No historical customer data repair in this phase.

## Phase 2 — reconcile ordered subscription/payment state (BQ-04; launch blocking)

Exact planned files:

- New `apps/api/src/lib/billing-state.ts`
- `apps/api/src/routes/billing.ts`, `apps/api/src/routes/razorpay.ts`
- `apps/api/src/lib/billing-providers.ts`
- `packages/db/prisma/schema.prisma`
- New `packages/db/prisma/migrations/20261026121000_billing_state_revision/migration.sql`
- New `apps/api/test/lib/billing-state.test.ts`
- `apps/api/test/routes/billing.test.ts`, `apps/api/test/routes/razorpay.test.ts`

**Migration: yes**, monotonic subscription state revision for conditional application; do not rely on timestamp precision alone. Coordinate with Phase 1 so field/table ownership does not overlap another chat.

Regression first: an old same-subscription active event cannot restore a canceled workspace; an old cancellation cannot downgrade a renewed active subscription. Distinct event IDs, duplicate IDs, equal timestamps, different modes, replaced subscription IDs, and two concurrent authoritative snapshots are separate cases. A late payment failure must not erase captured/partially-refunded/refunded records. Provider reconciliation failure returns a retryable webhook outcome and leaves state unchanged.

Create provider-specific adapters that reconcile current provider state using mocked retrieve/fetch methods. Capture local revision **before** retrieval, and apply subscription plus workspace plan atomically only if revision/ownership still matches. On revision conflict, retry reconciliation rather than writing a stale snapshot. Verify exact SDK methods locally. A provider event timestamp may be an additional filter, but not the sole guarantee. Update ledger transitions atomically; do not apply a final-state reversal merely because its delivery arrived later. Expansion of permitted refund/settlement transitions requires explicit policy, not an invented ordering rank.

Do not alter prices, refund eligibility or grace periods. A failed provider retrieval must not be interpreted as FREE or paid. Verify error/redelivery and concurrent state-change tests, API gates and a disposable DB revision race. Docs: supported event families, source-of-truth and replay/reconciliation procedure in `docs/DODO_PAYMENTS.md` and `docs/RUNBOOK.md`.

## Phase 3 — expire all recorded terminal entitlements safely (BQ-05; launch blocking)

Exact planned files:

- New `packages/shared/src/billing-entitlements.ts` and `packages/shared/src/billing-entitlements.test.ts`
- `packages/shared/src/index.ts`
- New `apps/worker/src/lib/subscription-expiry.ts`
- `apps/worker/src/index.ts`
- New `apps/worker/test/lib/subscription-expiry.test.ts`
- `apps/api/src/routes/billing.ts`, `apps/api/src/routes/razorpay.ts`

**Migration: no additional migration** if Phase 2's revision exists. Otherwise introduce that revision before using scan/write guards.

Regression first: import the seven scratch expiry cases (six omitted terminal statuses plus the passing `cancelled` control). Cover all statuses already given period-limited access by webhook code, exact boundary time, null period, manual grants, future periods, replacement subscriptions, and renewal occurring after the scan but before the update. Assert workspace plan changes in the same transaction as the guarded subscription update.

Extract the existing policy into one shared predicate; retain the already-intended behavior of future paid-period access, then remove access once that recorded end is reached. Include Stripe spelling `canceled` and Dodo terminal states rather than relying on a provider-agnostic short string list. Re-read/compare ID, provider, revision/status and period in the transaction. A concurrent renewal/replacement must prevent an old scanned row from downgrading its workspace. Decide with product/ops whether expiry needs a cadence shorter than the existing daily retention job; separate it from destructive retention work.

Verification: pure predicate tests, worker transaction mocks, one bounded disposable DB race, API/worker/shared gates. Docs: concrete cadence, ownership and reconciliation metrics in `docs/RUNBOOK.md`. No new grace period and no live expiry sweep.

## Phase 4 — preserve provider currency (BQ-06; conditional launch block)

Exact planned files: `packages/shared/src/payment-gateways.ts`, new `packages/shared/src/payment-currency.test.ts`, `packages/shared/src/index.ts`, `apps/api/src/routes/billing.ts`, `apps/api/src/routes/razorpay.ts`, `apps/api/test/routes/billing.test.ts`, `apps/api/test/routes/razorpay.test.ts`.

**Migration: no** for new values: `Payment.amount` already supports three decimals. Historical correction is explicitly excluded and requires its own reviewed dry-run/backfill plan.

Regression first: provider fixtures for INR/USD two-decimal, JPY zero-decimal and KWD three-decimal values; reject unknown/missing currency or malformed amounts according to a documented ingestion rule instead of silently substituting INR. Keep the exact 12345 KWD fixture, which currently records 123.45 INR. Test replay/upsert without denomination mutation.

Share the existing tested currency exponent logic and use the provider's currency. Verify supported currencies against the installed provider definitions/documented configuration before implementation; do not change merchant products or prices. Docs: supported currency ingestion and historical reconciliation caveat in `docs/DODO_PAYMENTS.md`/`docs/RUNBOOK.md`. Run this before any affected non-INR offering is enabled.

## Phase 5 — make repeated usage synchronization lossless (BQ-07)

Exact planned files: new `apps/worker/src/lib/operational-usage.ts`, `apps/worker/src/index.ts`, new `apps/worker/test/lib/operational-usage.test.ts`. **Migration: no** for re-aggregation from existing run snapshots.

Regression first: preserve the scratch three-run fixture across two incremental syncs: prior-day totals remain 2 runs, cost 3, results 5. Add UTC midnight boundary, duplicate provider run IDs, multi-page fetch, incomplete page/cap, running-to-finished transition, and repeated retry without double counting.

Move only the operational-sync function into a testable module; avoid unrelated worker rewrites. Persist provider runs by their existing `(actorId,apifyRunId)` key, then rebuild touched UTC days from complete stored snapshots or a verified complete-day fetch. Never replace a whole day from a partial interval or truncated newest-N page. Do not add amounts to old totals on retry. Explicitly resolve billing-endpoint versus run-derived cost provenance with the analytics owner; preserve settlement policy and mark incomplete cost coverage rather than declaring a new financial source of truth.

Verification: lossless repeated-sync fixtures plus worker typecheck/lint/tests. Coordinate metrics coverage with the analytics/UI owner without changing UI files here. Docs: coverage/freshness semantics in `docs/ACTOR_INTELLIGENCE.md` and sync reconciliation in `docs/RUNBOOK.md`.

## Phase 6 — retain known counts during provider outages (BQ-08)

Exact planned files: `apps/worker/src/lib/operational-usage.ts`, `apps/worker/test/lib/operational-usage.test.ts`, `packages/db/prisma/schema.prisma`, new `packages/db/prisma/migrations/20261026122000_run_result_count_freshness/migration.sql`. **Migration: yes** for explicit result-count freshness/known-state metadata if the product must distinguish never-read from an actual zero; coordinate downstream aggregates before finalizing the field contract.

Regression first: known count 4 plus a transient dataset failure remains 4; successful zero replaces 4; first-ever failure stays unknown; retry eventually records the real value. No request may fabricate a successful sync timestamp on failure.

Replace error-to-zero fallback with an unknown result. Preserve previous successful counts and freshness, expose incomplete coverage to aggregation, and retry safely. Do not backfill unknown historical rows as verified zero. Audit consumers with the analytics owner before changing nullable/count contracts. Docs: unknown-vs-empty behavior in `docs/ACTOR_INTELLIGENCE.md`.

## Phase 7 — reconcile enqueue uncertainty (BQ-09)

Exact planned files: `apps/api/src/lib/queue.ts`, `apps/api/src/routes/bulk-publishing.ts`, new `apps/worker/src/lib/operation-dispatch.ts`, `apps/worker/src/index.ts`, `packages/db/prisma/schema.prisma`, new `packages/db/prisma/migrations/20261026123000_operation_dispatch_outbox/migration.sql`, new `apps/api/test/lib/queue.test.ts`, `apps/api/test/routes/bulk-publishing.test.ts`, new `apps/worker/test/lib/operation-dispatch.test.ts`. **Migration: yes**, durable dispatch/outbox state; coordinate operation ownership with Phase 1 rather than creating competing dispatch mechanisms.

Regression first: keep the 1500 ms timeout/1600 ms acceptance fixture. Add API timeout then worker acceptance; client retry with the same operation key; duplicate worker delivery; dispatcher crash before/after Redis acknowledgement; and a genuinely canceled operation. Assert at most one domain application and truthful pending/unknown/final states. All clocks/connections are mocked; at most two simultaneous functional requests.

Use operation ID as a stable job/deduplication key. Persist dispatch intent with the domain operation; separate unknown submission from confirmed failed execution. Let a dispatcher reconcile durable intent with worker acceptance. Worker state claims must respect canceled/final operations and must not reset every FAILED item to QUEUED unconditionally. Do not try to solve remote acknowledgement uncertainty by rejecting a promise sooner. Docs: unknown dispatch reconciliation, retry ownership and operator steps in `docs/RUNBOOK.md`.

## Phase 8 — resolve suspected policy/lock seams and run acceptance gates

For BQ-S1, obtain an explicit event-to-entitlement policy including unpaid completed checkout, trial, created/authenticated subscription, failure and refund. Test that policy before proposing a code change; **migration undecided until policy is known**. No pricing/settlement invention.

For BQ-S2, exact files are `apps/worker/src/lib/leader-election.ts`, `apps/worker/src/index.ts`, `apps/worker/src/lib/bulk-publishing.ts`, with `apps/worker/test/lib/leader-election.test.ts` and a new bounded operation-lock test. Use a fake-clock two-worker fixture that crosses lease expiry with one unfinished actor. Only if reproduced, plan heartbeat/fenced ownership and per-item idempotency. **Migration: no** unless durable fencing is required by the verified design. Do not run an hour-long job or load test.

Then run the declared full typecheck/lint/test/build scripts, script tests and secret scan with Gitleaks available. Use a disposable MySQL/Redis stack for migrations and claim/outbox races. Parent owners supply container boot, auth/CSRF/browser/SCA and backup-restore acceptance evidence. Provider sandbox golden paths remain pending user verification; no live key/card or provider request is authorized by this audit plan. Gate success must include exact counts, failures and skips, not only a green summary.
