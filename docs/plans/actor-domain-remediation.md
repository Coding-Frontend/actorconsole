# Actor domain remediation plan

> Integration review: the verified owner source `80909babf4670dd03c2f081e52dfac5ad83dd735` and report HEAD `c54f28be3704b66edbdb11972de464189b13ed3b` were imported. A missed initial `TIMING-OUT`/unknown-state AD-02 case reproduced four failing assertions; the coordinator follow-up waits unless failure is confirmed terminal. Publishing checks now total 21, with 33 focused Worker checks passing. Earlier owner-only totals below remain historical. Exact combined checks and accepted commits are in [the integration record](../audit/2026-10-integration.md). No DB contention or live-provider pass is inferred.

Base: `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`, branch `work`, repository `/workspace/actorconsole`.

The latest user instruction authorized implementation, local commits, and a normal push of `fixes/actorconsole-20261026-actors`. Main and production remain outside this authorization. The pre-steer draft was reviewed before editing; its patch remains in `/workspace/scratch/actor-domain-audit/pre-planning-changes.patch`. The confirmed fixes are implemented and checked; integration/publishing remains owned by the architecture coordinator. No shared auth/billing, commercial/access/retention policy, migration, dependency, CI/CD or security-setting changes were made.

Implementation source/tests commit: **`80909babf4670dd03c2f081e52dfac5ad83dd735`**. Final documentation HEAD and push verification are recorded in the handoff response.

## Execution disposition

- Phase 1 complete: actor-restricted logo list/count and apply/dismiss guards; ten endpoint regressions pass with real capability middleware and mock provider/storage.
- Phase 2 complete: waits returning an unfinished run never start a second active run; 14 publishing tests pass, including the previously failing regression.
- Phase 3 complete: shared snapshot construction and isolated optimization handlers; eight snapshot tests plus four handler lifecycle tests pass, including null/non-null images and genuine stale checks before writes.
- Phase 4 complete for confirmed cases: terminal/version claims, counters, known enqueue failure compensation and correct completion status; 20 API tests pass. Simultaneous requests are modeled unit fixtures; real DB contention/ambiguous queue write outcomes remain pending integration testing.
- Phase 5 complete: actual lifecycle text, zero/partial queue failures, caught recheck failures and pending controls; nine component tests pass. Shared auth/2FA forms untouched.
- Phase 6 complete: dataset and dashboard integer validation, post-100,000 navigation, encoded KV cursor retention; run page has seven passing tests. The unproven README-filter candidate was dropped and the old predicates retained.
- Phase 7 remains a separate readiness/security follow-up: disposable DB/Redis, browser/production-container rehearsal, real contention and dependency advisory triage were not performed or declared passed here.

Full final unit/component suite: **1,891 passed, 3 skipped**. Typecheck 16/16 tasks, lint 11/11, build 10/10, script tests 6/6 pass. Gitleaks 8.30.1 was downloaded using the CI's checksum-verification procedure; available-history scan passed and is repeated on committed handoff changes before push. No test or security gate was disabled. See the audit's implementation section and final handoff for exact logs, commit IDs and push verification.

The phase descriptions below retain the original regression requirements and integration limits. Their old pre-fix counts/line references are historical context, not current failures.

## Phase 1 — actor restriction at logo endpoints (one session, launch blocking AD-03)

Owner: actor domain endpoints; coordinate policy/evidence with authentication owner. Keep this distinct from server recovery/session issues and UI Enter-key 2FA dispatch.

Exact files: `apps/api/src/routes/actor-logo-recommendations.ts`, `apps/api/test/routes/actor-logo-recommendations.test.ts`. No shared authentication middleware redesign.

1. First add regressions mounting the real `requireApiKeyMethodScope({allowGranularMcp:true})` and `requireActorApiKeyCapability` with a fabricated same-workspace key restricted to Actor A. Seed/mock recommendations for A and B. GET list/count must exclude B; apply/dismiss B must return a policy-consistent 403 or scoped 404 without loading logo bytes, calling provider credentials, updating provider metadata, or changing recommendation state. Unrestricted interactive sessions must retain existing behavior. Use scratch `fixtures/logo-actor-scope.test.ts` as evidence; invert the undesired observations into permanent regression assertions.
2. Apply actor-ID restrictions to list/count queries, and guard the loaded actor before apply/dismiss. Keep existing owner/workspace filters. Do not widen read/write permissions or modify legacy key compatibility.
3. Migration: **no**.
4. Verify targeted API tests including middleware capability tests, then full typecheck/lint/test. No provider requests; mocks only. Add a disposable two-user/two-workspace test when readiness owner provisions the DB.
5. Docs: audit AD-03 disposition and the API credential scope documentation if behavior/policy needs clarification.

## Phase 2 — stop duplicate validation runs (one session, launch blocking AD-02)

Files: `apps/worker/src/lib/bulk-publishing.ts`, `apps/worker/test/lib/bulk-publishing.test.ts`. The worker entry-point call site may need a narrow retry-state adjustment only if tests demonstrate it.

1. The first regression is already preserved and failing at `bulk-publishing.test.ts:103`. Expand before fixing: existing RUNNING→RUNNING/READY after wait must not call start; existing→SUCCEEDED must reuse; existing→terminal FAILED may start one replacement; started→unfinished must not publish; started→SUCCEEDED may publish. Use call counts, run IDs, and `resolveBulkPublishingFailure` classification to check timeout is distinct from terminal failure.
2. Recheck installed Apify semantics at `node_modules/apify-client/dist/resource_clients/run.js:284`. After the wait, branch explicitly on nonterminal state and return/defer or raise an actionable retryable outcome. Preserve the successful-run prerequisite; do not treat timeout as success, abort the existing run, or start a replacement while it remains active.
3. Migration: **no**.
4. Verify the worker suite, then the full gate. The final full suite must change from 1 failed/1,861 passed/3 skipped to all required tests passing. Do not delete/skip the failing regression or loosen assertions.
5. Docs: audit AD-02 status and execution timeout/retry semantics in Apify coverage docs if behavior changes user expectations.

## Phase 3 — review fingerprint draft and prove apply lifecycle (one session, launch blocking AD-01)

Files: preserved `apps/worker/src/index.ts`, `apps/worker/src/lib/actor-optimization-state.ts`, `apps/worker/test/lib/actor-optimization-state.test.ts`; a narrowly isolated worker test/harness if needed. Avoid formatting/refactoring other worker domains.

1. Keep the baseline AST reproduction and eight snapshot regressions. First add a mocked worker audit→approved apply regression: unchanged metadata with null/non-null image must reach apply, persist APPLIED and correct counts; a genuine metadata or pricing change must mark STALE before any provider mutation. Verify only selected approved fields are sent.
2. Review the existing draft's use of the single snapshot builder in generation and application; keep the same key set/order and stale guard. Do not remove image comparison or bypass stale checks. Review handling of previously generated fingerprints; use explicit recheck rather than an automatic backfill or automatic publication.
3. Migration: **no**; no stored proposal/data mutation during this phase.
4. Verify worker helper/lifecycle tests, typecheck/lint/full tests. No AI/provider calls. Existing helper tests alone are not sufficient proof of the entire worker lifecycle.
5. Docs: audit AD-01 disposition and operator note that old proposals require recheck.

## Phase 4 — review recheck draft and counter invariants (one session, AD-04)

Files: preserved `apps/api/src/routes/actor-optimization.ts`, `apps/api/test/routes/actor-optimization.test.ts`. Coordinate queue timeout/outcome ambiguity with queue/platform owner; do not rewrite shared queue behavior independently.

1. Keep active-status, lost-claim, enqueue-null, and enqueue-exception regressions. Add terminal READY/FAILED/STALE/APPLY_FAILED/APPLIED cases, counter invariants, and two concurrent requests against a disposable DB with the same result version. Exactly one successful claim/enqueue/counter adjustment is allowed. Assert counts do not become negative or exceed total, and all-failed runs do not become ready for approval.
2. Review the preserved status/version compare-and-set inside the transaction. Confirm retries clear approval/application fields consistently, and counters reflect the prior terminal state. Test real queue failure without assuming timeout proves nonexecution; reconcile ambiguous enqueue outcomes before finalizing a retry policy.
3. Migration: **no expected**; if locking/outbox work becomes necessary, split a separately reviewed design/migration phase rather than changing schema implicitly.
4. Verify route tests and disposable transaction tests, full checks. Mark real concurrency pending until the DB test actually runs.
5. Docs: audit AD-04 evidence and state transition/retry contract.

## Phase 5 — truthful improvement result states (one session, AD-07; UI owner)

Files: `apps/web/src/components/dashboard/actor-optimization-review.tsx` and `.test.tsx`. No auth form or broad dashboard restyling edits.

1. First convert scratch observation fixtures into regressions: 202 `{queued:0,failed:n}` must not announce work is applying; partial queue success must state queued/failed counts; APPLIED must show completion without a generating spinner; APPROVED/APPLYING show the corresponding state; failures expose appropriate recovery. A rejected recheck fetch must be caught and reported; disable duplicate recheck submissions while pending.
2. Branch on response counts and explicit lifecycle status. Retain explicit field selection, review confirmation, and the server's approval requirement. Do not auto-approve, auto-select new proposals after recheck, or turn network errors into success.
3. Migration: **no**.
4. Verify component regressions and the full web test/typecheck/lint gates; browser verification against localhost only once the readiness owner has a disposable stack.
5. Docs: audit AD-07 disposition. Coordinate with broader UI owner before editing this component.

## Phase 6 — review result navigation and pagination drafts (one session, AD-05/AD-06/AD-08)

Files: preserved `apps/api/src/routes/actors.ts`, its route tests, and the run page `apps/web/src/app/(dashboard)/dashboard/actors/[id]/runs/[runId]/{page.tsx,page.test.tsx}`. Coordinate with UI owner for the page.

1. Keep dataset offset 100020 and malformed-offset regressions; add UI Next/Previous behavior across 100000 and final page. Keep the current fixed 20-item request limit and parent-run ownership checks. Review chosen integer bounds without inventing a different product cap.
2. Keep encoded KV key/cursor retention regression; add navigation from second→third list page and selecting a key containing `/`, spaces, `&`, `?`.
3. Keep malformed dashboard page validation; decide the upper page bound consistently with existing list APIs. Do not claim a real Prisma error was reproduced until it is.
4. Review the pre-planning `hasReadme:false` consistency addition separately. It is not a confirmed independently hidden-Actor bug: `publishReady:false` already catches normal missing-README rows. If retained, agree on both actor and bulk publishing predicates and test a realistic divergent/stale row before claiming user impact. Do not broaden this to publishing policy changes.
5. Migration: **no**.
6. Verify API route and run-page component suites, full checks. Docs: audit dispositions and any agreed pagination contract.

## Phase 7 — actor readiness evidence and residual limits (one session with readiness/security owners)

1. Provision an explicitly disposable loopback DB/Redis via the readiness owner's approved setup; do not reuse private root `.env`, create production users, or make provider calls. Apply every migration to an empty DB and run the opt-in integration suite. Record exact schema/target identity without secrets.
2. Exercise two synthetic workspaces/users through discovery/import/configuration (mock providers), optimization lifecycle, run-history fallback, and storage pagination. Verify actual rows and status/count transitions. Local browser tests should cover these paths; no staging fallback.
3. Build/run the production container against those disposable services and check health/home/dashboard. Container success is separate from the already passed package build.
4. Security/dependency owner must triage `pnpm-audit.json` by installed/lockfile version, runtime reachability, and fix compatibility; raw 42 advisories are not 42 launch blockers. Confirm Gitleaks, outdated security-relevant dependencies, package install scripts/licences, image inputs, and lock integrity. Dependency remediation belongs to the parallel security/dependency owner; do not weaken gates.
5. Docs: update the actor audit and the consolidated parent readiness report with passed/failed/not-run evidence; retain AD-02's gate failure until actually fixed. No launch risk acceptance is implied by deferring this phase.

## Verification/tool invocation notes

Use repository-specified pnpm 9.15.0. In this environment it is available through `PATH=/tmp/actor-audit-tools/bin:$PATH`; installed pnpm 11 attempted an implicit dependency install and was unsuitable. This is a tool-path adjustment, not a repository or gate change.

Final implementation checks: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test --maxWorkers=2 --minWorkers=1`, `pnpm run test:scripts`, `pnpm run build`, and Gitleaks with the existing `secrets:check` script once available. Use the local-only/telemetry-disabled build environment documented in the audit. Re-run the source digest/change inventory and record exact files, base SHA, check totals, skipped suites, and unresolved blockers. Only the user-authorized handoff branch may be committed/pushed normally; main, merge and deployment remain with the coordinator.
