# Actor domain audit — implementation handoff, 2026-10-26

> Integration review: the verified owner source `80909babf4670dd03c2f081e52dfac5ad83dd735` and report HEAD `c54f28be3704b66edbdb11972de464189b13ed3b` were imported. A missed initial `TIMING-OUT`/unknown-state AD-02 case reproduced four failing assertions; the coordinator follow-up waits unless failure is confirmed terminal. Publishing checks now total 21, with 33 focused Worker checks passing. Earlier owner-only totals below remain historical. Exact combined checks and accepted commits are in [the integration record](2026-10-integration.md). No DB contention or live-provider pass is inferred.

## Current implementation status

The latest user instruction authorized implementation, local commits, and a normal push of **`fixes/actorconsole-20261026-actors`**. This supersedes the earlier planning-only phase. The original ten preserved application files were inspected before further edits; no unrelated work was present. Base remains **`fc52f547286b14de2f483899b4aa5dcdfca8b5ea`**. Main is not the push target. The architecture chat is the integration/publishing coordinator.

All eight confirmed AD findings are addressed in this branch, including the three baseline launch blockers. This is a scoped implementation disposition, not a product launch certification. No shared authentication or billing module, commercial/access/retention policy, schema/migration, dependency/lockfile, CI/CD setting, production data, credential, or deployed service was changed. No paid/live provider request was made. The pre-steer draft remains available in `/workspace/scratch/actor-domain-audit/pre-planning-changes.patch` for historical comparison.

| Finding | Current disposition and implementation | Permanent regression evidence |
| --- | --- | --- |
| AD-01, High, baseline blocker | Fixed: generation and application build the same metadata snapshot/fingerprint. `apps/worker/src/lib/actor-optimization-state.ts:48`; `actor-optimization.ts:80` and `:235`. Optimization handlers moved from the worker entry point to a module that can be tested without starting workers. | Eight snapshot tests and four actual handler lifecycle tests. Unchanged proposals with null/non-null images reach APPLIED; genuine metadata changes reach STALE before provider/Actor mutation; only approved fields are sent; unapproved/replayed application does not write. |
| AD-02, High, baseline blocker | Fixed: `apps/worker/src/lib/bulk-publishing.ts:15` treats unfinished waits as retryable. Existing in-progress runs never trigger a replacement after wait timeout; only terminal failure permits replacement. Success remains mandatory for publication. | 14 worker publishing tests, including RUNNING/READY/STARTING/STOPPING/ABORTING after wait, successful reuse, terminal-failure replacement, and unfinished newly started runs. The preserved failing regression now passes. |
| AD-03, High, baseline blocker | Fixed: `apps/api/src/routes/actor-logo-recommendations.ts:23` restricts list/count; `:77` and `:98` enforce the selected Actor before dismiss/apply side effects. Existing shared guards/policy unchanged. | Ten endpoint tests mount real capability/method middleware. Other-Actor writes return 403 and make no provider, storage, or DB mutation; included Actors retain access and missing mutation capability remains denied. |
| AD-04, Medium | Fixed for confirmed cases: `apps/api/src/routes/actor-optimization.ts:443` rejects in-flight rechecks, claims status/version atomically before counter changes, handles enqueue rejection/null, and derives completion status from aggregate counts. Terminal APPLIED resets its applied counter. | 20 API tests; all terminal prior statuses, active statuses, lost claims, two simultaneous modeled requests, null/rejected enqueue, and other still-running results. Real DB lock contention and ambiguous accepted-then-timeout Redis writes remain unverified. |
| AD-05, Medium | Fixed: `apps/api/src/routes/actors.ts:1029` validates a safe integer offset without clamping to 100,000; 20-item page limit retained. | API later-page/malformed-offset tests; run-page Next/Previous tests across 100,000 and at the final page. |
| AD-06, Low | Fixed: run-page record links preserve the list cursor through URLSearchParams. | Seven run-page tests include encoded `/`, spaces, `&`, `?`, Unicode keys and pagination, plus retained expired-run behavior. |
| AD-07, Medium | Fixed: `apps/web/src/components/dashboard/actor-optimization-review.tsx:82` renders actual result progress; `:314` reports enqueue failures/partial success; `:331` catches recheck failures and clears old field selection; pending rechecks disable duplicate controls. | Nine component tests include APPLIED without generation text, APPROVED/APPLYING labels, zero/partial queued failure responses, network rejection, and existing explicit approval/bulk-selection behavior. |
| AD-08, Low | Fixed input handling: `apps/api/src/routes/actors.ts:498` uses the existing integer-query contract and the existing list API's 100,000 page bound. | Malformed/nonfinite/fractional/out-of-bound pages rejected before DB list query. A real-DB 500 was never reproduced and remains an unconfirmed impact claim. |

The prior README readiness predicate change and its structural test were **removed during review**: normal `publishReady:false` already covers missing README. It was not a separately confirmed defect. Bulk publishing predicates were not changed. No policy change was inferred from that candidate.

## Final implementation verification

Pinned pnpm 9.15.0 is on PATH from `/tmp/actor-audit-tools/bin`; installed pnpm 11 is not used. Tests use fabricated providers and persistence. No private `.env` was loaded for testing.

| Command | Final result |
| --- | --- |
| `pnpm run typecheck` | PASS; 16/16 Turbo tasks |
| `pnpm run lint` | PASS; 11/11 tasks, existing zero-warning gate |
| `ACTORCONSOLE_TEST_DATABASE_URL= OTEL_SDK_DISABLED=true SENTRY_DSN= pnpm run test --maxWorkers=2 --minWorkers=1` | PASS; **1,891 passed, 3 skipped, 1,894 total; 233 files passed, 1 file skipped** |
| `pnpm run test:scripts` | PASS; 6/6 |
| `NEXT_TELEMETRY_DISABLED=1 SENTRY_AUTH_TOKEN= SENTRY_DSN= OTEL_SDK_DISABLED=true API_BASE_URL=http://127.0.0.1:1 NEXT_PUBLIC_API_BASE_URL=/api NEXT_PUBLIC_SITE_URL=http://localhost:8080 pnpm run build` | PASS; 10/10 tasks; 44.446 s |
| `pnpm run secrets:check` with checksum-verified Gitleaks 8.30.1 | PASS on available baseline history; repeated after commits before push. Exact committed-scan result recorded in handoff response. |
| `git diff --check` | PASS |

Initial implementation regression run for logo-scope/duplicate-run cases: **9 failed, 15 passed** before fixes; **24 passed** after fixes. UI regression run: **6 failed, 3 passed, 1 unhandled network rejection** before fixes; all nine component tests now pass and the unhandled rejection is handled. Scoped eight-file regression set initially passed 134 tests, followed by four additional passing run-page cases and the final full suite above. An intermediate lint failure from the moved retry helper was corrected by removing its unused old declaration; no lint rule changed.

Logs: `/workspace/scratch/actor-domain-audit/final-{typecheck,lint,tests,build,script-tests}.log`, `final-secrets-history.log`, `implementation-blockers-{red,green}.log`, `implementation-ui-red.log`, `implementation-targeted.log`. Earlier planning-phase failures below are retained historical evidence and are not current gate results. The original observation fixtures asserting undesirable behavior are historical reproductions; current regression assertions live in the repository test files.

Remaining limits: the three opt-in real-DB tests remain skipped; no local browser stack or disposable production container was booted. No live/paid provider was tested. Actual DB contention and queue write timeout/nonexecution ambiguity require the integration coordinator's shared queue/disposable-service testing; the shared queue contract was not changed or certified. Existing inconsistent persisted counters were not rewritten. Repository-wide raw SCA output remains for the dependency/security owner; this branch contains no dependency remediation. No product launch, merge, production deployment, or risk acceptance is implied.

## Source commit and handoff

Source and regression tests are committed as **`80909babf4670dd03c2f081e52dfac5ad83dd735`** on `fixes/actorconsole-20261026-actors`, based on `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`. This document and the remediation status are a separate documentation commit. The handoff response records the final branch HEAD and exact normal-push remote verification; no main push, merge or deployment is part of this task.

## Exact implementation file inventory

Application files (17; source/tests only):

- `apps/api/src/routes/actor-logo-recommendations.ts`
- `apps/api/src/routes/actor-optimization.ts`
- `apps/api/src/routes/actors.ts`
- `apps/api/test/routes/actor-logo-recommendations.test.ts`
- `apps/api/test/routes/actor-optimization.test.ts`
- `apps/api/test/routes/actors.test.ts`
- `apps/web/src/app/(dashboard)/dashboard/actors/[id]/runs/[runId]/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/actors/[id]/runs/[runId]/page.test.tsx`
- `apps/web/src/components/dashboard/actor-optimization-review.tsx`
- `apps/web/src/components/dashboard/actor-optimization-review.test.tsx`
- `apps/worker/src/index.ts`
- `apps/worker/src/lib/actor-optimization-state.ts` (new)
- `apps/worker/src/lib/actor-optimization.ts` (new; existing optimization handlers isolated from process startup)
- `apps/worker/src/lib/bulk-publishing.ts`
- `apps/worker/test/lib/actor-optimization-state.test.ts` (new)
- `apps/worker/test/lib/actor-optimization.test.ts` (new)
- `apps/worker/test/lib/bulk-publishing.test.ts`

Documents: `docs/audit/2026-10-actor-domain-audit.md`, `docs/plans/actor-domain-remediation.md`. Scratch logs, patches, tool downloads, generated output and private environment files are excluded from commits. Only the named handoff branch is authorized for a normal push; the final handoff records commit IDs and the remote-ref verification.

## Historical planning-only audit

The remainder records the earlier audit snapshot, its original line references, baseline reproduction results, and preserved pre-steer WIP. Earlier planning-only restrictions and red/not-run gate statements describe that phase; the current authorized implementation and verification are above.

## Scope, baseline, and instruction change

Repository: `/workspace/actorconsole`, remote `https://github.com/Coding-Frontend/actorconsole.git`.
Initial branch: `work`; initial clean HEAD: **`fc52f547286b14de2f483899b4aa5dcdfca8b5ea`** (`Update dependencies with Zod 4, Vite 8 and Sentry 11 compatibility fixes (#37)`). `git ls-remote --heads origin main` returned the same SHA. No local `main` or remote-tracking ref existed. No website domain was inferred or contacted.

Ownership: actor discovery, configuration, generation, execution, results, and their UI/API/persistence paths. Shared authentication, billing, general platform security, and broad UI redesign belong to other audit chats. Security and UI seams below need reconciliation with those owners; this report does not duplicate their fixes.

The original delegation authorized fixes. A later parent instruction changed this phase to **planning only**. Application edits stopped immediately; all ten earlier changed/new application files were preserved without reverting, committing, branching, pushing, or deploying. Only audit documents and scratch evidence were written after that instruction. SHA-256 verification confirms those ten files stayed unchanged after the switch. Current draft behavior is distinguished from untouched-baseline behavior throughout.

Read: `README.md`, `CONTRIBUTING.md`, `APIFY.md`, `SECURITY.md`, `deployment.instructions.md`, `docs/RUNBOOK.md`, `docs/ACTOR_INTELLIGENCE.md`, `docs/APIFY_CONSOLE_API_COVERAGE.md`, and environment examples. No `AGENTS.md`, `CLAUDE.md`, local `.agents/skills`, known-issues document, progress document, launch checklist, or separate architecture document was found. `/workspace/.agents` and `.codex` were empty. Existing documentation claims were checked against source rather than treated as evidence of correctness.

## Executive assessment

**Three launch-blocking baseline findings in this ownership:** AD-01, AD-02, AD-03. AD-01 has an uncommitted draft correction from before planning-only; AD-02 and AD-03 remain unchanged in application source. This is a scoped count, not a whole-product launch verdict.

Top priorities:

1. AD-03: an actor-restricted credential can read/apply another Actor's logo recommendation within its workspace.
2. AD-02: waiting for an already-running validation run can time out and start a second run, risking duplicate work and provider charges.
3. AD-01: generation/application metadata fingerprints differ, preventing unchanged generated proposals from applying.
4. AD-04: recheck can corrupt lifecycle counters or become stuck after enqueue failure on the baseline.
5. AD-07: the improvement UI reports application success even when every enqueue failed and shows generation activity after completion.

No production requests, provider runs, paid AI calls, payment calls, credential creation, production data changes, CI/CD changes, or security-setting changes were made. All reproductions used fabricated local objects, Hono requests in memory, or DOM fixtures.

## Gate evidence

These are **preserved working-tree results**, not a clean-baseline full-gate claim. Node `v24.19.0`; installed Vitest `2.1.9`. The environment initially supplied pnpm `11.25.0`, while the repository specifies `9.15.0`. pnpm 11 tried an implicit dependency install and failed creating `/home/agent/.local/share/pnpm`; no approval denial occurred. A standalone pnpm 9.15.0 tarball was downloaded with `npm pack --ignore-scripts` to `/tmp/actor-audit-tools`; its bin directory was placed first in PATH. No application dependencies or lockfiles were changed.

| Check | Command with pinned pnpm on PATH | Result |
| --- | --- | --- |
| Typecheck | `pnpm run typecheck` | PASS, 16/16 Turbo tasks; 33.715 s |
| Lint | `pnpm run lint` | PASS, 11/11 tasks, zero-warning gate retained; 25.22 s |
| Unit/component tests | `ACTORCONSOLE_TEST_DATABASE_URL= OTEL_SDK_DISABLED=true SENTRY_DSN= pnpm run test --maxWorkers=2 --minWorkers=1` | **FAIL: 1 failed, 1,861 passed, 3 skipped, 1,865 total; 231 passed files, 1 failed file, 1 skipped file; 58.69 s** |
| Build | `NEXT_TELEMETRY_DISABLED=1 SENTRY_AUTH_TOKEN= SENTRY_DSN= OTEL_SDK_DISABLED=true API_BASE_URL=http://127.0.0.1:1 NEXT_PUBLIC_API_BASE_URL=/api NEXT_PUBLIC_SITE_URL=http://localhost:8080 pnpm run build` | PASS, 10/10 tasks; 50.162 s; no source-map upload or production API target |
| Script tests | `pnpm run test:scripts` | PASS, 6/6 |
| Secret scan | `pnpm secrets:check` | NOT RUN: Gitleaks executable absent; no clean-secret claim |
| Database integration | opt-in intelligence database suite | SKIPPED: no disposable database target configured |
| Browser/production-container/empty-database checks | not started | UNTESTED; see readiness limits |

The one failure is the newly written, preserved AD-02 regression at `apps/worker/test/lib/bulk-publishing.test.ts:103`. Its implementation was deliberately left unchanged after planning-only arrived. The gate must remain red until remediation is authorized and complete.

Earlier targeted validation, before that additional regression, passed 86/86 tests. That historical pass does not override the final full-suite failure.

Logs and reproducible scratch fixtures: `/workspace/scratch/actor-domain-audit/`. The durable files are listed below.

## UI → API → persistence trace and incomplete-work inventory

| Workflow | Reachable implementation | Persistence/external boundary | Assessment |
| --- | --- | --- | --- |
| Public discovery | `components/intelligence/actor-research-view.tsx` → web `lib/actor-research.ts`/`backend-data.ts` → API public catalog → `apps/api/src/lib/actor-research.ts` | Parameterized Prisma SQL over `StoreActor` and historical `StoreActorSnapshot` | Implemented. SQL placeholders, sort whitelist, and missing-history handling checked. No claim of live catalog freshness. |
| Workspace discovery | `components/dashboard/actors-workspace.tsx` → `/actors/dashboard-list`, `/dashboard-selection`, `/refresh` and `/refresh/:jobId` | `Actor`, workspace credential, BullMQ snapshots queue, inventory reconciliation | Implemented. Removed Actors excluded from normal actor inventory. Pagination issue AD-08 and readiness consistency note below. |
| Inventory import | `/actors/sync` or worker workspace bootstrap → `admitWorkspaceActors` | Workspace transaction/row lock; historical rows retained using `apifyRemovedAt` | Implemented. Complete-inventory requirement and failure before reconciliation verified by existing tests. 10,000-Actor pagination guard fails closed; not a stub. |
| Listing configuration | Actor actions/card rename, copy-rewrite/pricing dialogs → PATCH Actor, rewrite/copy/pricing/category-feedback routes | Apify metadata/pricing APIs; `Actor`, `CopyVariant`, `PricingHistory`, user audit | Implemented. Categories remain Apify-managed; source-file editing intentionally excluded. |
| Generated improvements | `ActorOptimizationReview` → create run → approve/recheck → optimization worker | `ActorOptimizationRun`, `ActorOptimizationResult`, queue, Apify updates | Implemented but baseline AD-01/AD-04 and untouched AD-07 break important lifecycle states. |
| Logo configuration | recommendation list/apply/dismiss → `actor-logo-recommendations.ts` | Workspace recommendations/logo storage → Apify → `Actor` and recommendation status | Implemented with confirmed actor-restriction gap AD-03. |
| Execution/publication | publishing workspace/schedule components → `/bulk-publishing/schedules` and run routes → worker → `ensureSuccessfulActorRun` | `BulkPublishSchedule`, schedule Actors/runs, Apify run/publication | Implemented. AD-02 duplicates a still-active validation run after wait timeout. |
| Results/history | Actor detail/insight/history components and run page → `/actors/by-id/:id`, `/runs/:runId` | Cached snapshots; live authorized run logs/dataset/KV; `ActorRunSnapshot` fallback for expired runs | Implemented. Baseline AD-05/AD-06 lose result navigation. |

Mechanical handler inventory: **71 route declarations** across `actors.ts` (35), `actor-optimization.ts` (6), `actor-logo-recommendations.ts` (3), `apify.ts` (6), `bulk-publishing.ts` (21). See scratch `route-inventory.json`. Financial aliases are inventoried for routing context, not independently audited for billing correctness.

A bounded literal search of the primary files above found **no TODO/FIXME, coming-soon, not-implemented marker, or hardcoded `disabled={true}`**. Disabled controls are conditional on asynchronous activity, selection, page boundaries, quota/plan state, or credential readiness. This textual result does not establish that each workflow works; the behavioral findings below are the incomplete paths.

Intentional exclusions are not TODOs: README/input/output/source-file generation is rejected by current schemas and tests; Store categories are automatic and expose correction feedback; generic SDK/run-rule/runtime endpoints and old run-only schedules are documented removals. Do not restore them without a product decision. There is no generic manual start/abort run form in the reviewed Actor page; the supported execution path reviewed here is publishing validation and run-history inspection.

## Findings

### AD-01 — unchanged generated proposals always become stale

- **High; CONFIRMED on untouched baseline; launch blocking.** Core generate → review → apply cannot complete even when metadata has not changed.
- Baseline reachable files/lines: `apps/worker/src/index.ts:368` builds the audit snapshot without `imageUrl`; `:412` fingerprints it. Application `:531` builds a second snapshot containing `imageUrl` at `:539`; `:542` marks mismatch `STALE`. UI starts via `apps/web/src/components/dashboard/actor-actions.tsx:97` and API creates/approves via `actor-optimization.ts:155`/`:285`.
- Reproduction: `node /workspace/scratch/actor-domain-audit/baseline-fingerprint-repro.cjs`. This extracts the actual baseline functions and relevant initializers using the installed TypeScript AST, supplies fabricated metadata, and hashes the results without importing/starting the worker.
- Observed for no image: generated `67f1780c230c9fe02ff4a8748c9b11af27ce6db9dccabad5a89e0a2591c1dd50`; application `6032adbf501585683400f1d811d92bee2b638d3e7419fe08ec75b88316140522`; `unchangedProposalIsStale: true`. Also reproduced with a synthetic non-null image. Script exit 0 confirms the mismatch assertions.
- **Pre-planning draft:** shared snapshot/fingerprint construction in `apps/worker/src/lib/actor-optimization-state.ts:48`; worker uses it at current `index.ts:318` and `:473`. Eight helper regressions pass, including unchanged image/null and changed metadata/pricing. Not a live provider/worker end-to-end proof. Proposals generated with old fingerprints should be rechecked; no data migration or automatic publication was performed.
- Plan: review/preserve the shared construction, add an isolated audit→approve→apply worker test with mocks, keep genuine stale protection, and recheck old proposals explicitly.

### AD-02 — validation wait timeout starts a duplicate run

- **High; CONFIRMED; launch blocking.** A legitimate long-running Actor may trigger additional provider work/charges during publication; a still-running run is also described as failed.
- Untouched source: `apps/worker/src/lib/bulk-publishing.ts:30` waits, checks only success at `:32`, then unconditionally starts another run at `:37`. Reachable from current worker `index.ts:965` (baseline `:1033`) while publishing a private Actor.
- Installed dependency evidence: `node_modules/apify-client/dist/resource_clients/run.js:284` and `:292` explicitly state `waitForFinish({waitSecs})` resolves with an unfinished `READY`/`RUNNING` run on timeout; implementation delegates at `:307`. Wrapper `packages/apify/src/client.ts:1346` preserves this result.
- Regression: `./node_modules/.bin/vitest run apps/worker/test/lib/bulk-publishing.test.ts --maxWorkers=2 --minWorkers=1` → **1 failed, 7 passed**. Fabricated existing run `run-1=RUNNING`; wait returns `RUNNING`; code calls `startActorRun` before another wait/error. Assertion at test `:103` expected `Actor validation run run-1 is still in progress`; got `Actor validation run run-1 finished with status RUNNING...`.
- Stronger positive observation is saved in scratch `fixtures/duplicate-run-observation.test.ts` / `duplicate-run-observation.log`: exactly one start call for the second run while the first remains active; no real run was started.
- No implementation edit was made. Plan: reject/defer a nonterminal existing run after wait without starting a replacement; permit a replacement only after a confirmed terminal failure; preserve publication's success gate. Test both success reuse and failure replacement.

### AD-03 — logo recommendations bypass actor-restricted credentials

- **High; CONFIRMED on untouched files; launch blocking.** This breaks the credential's selected Actor boundary, although the user/workspace boundary remains enforced.
- `apps/api/src/routes/actor-logo-recommendations.ts:17` filters by user/workspace only; dismiss `:61` and apply `:80` do the same. Apply reaches workspace Apify credentials at `:89` and updates the other Actor at `:106`. No `assertApiKeyActorScope` or actor-ID query filter is present in this file.
- Reachable middleware: `apps/api/src/app.ts:204` onwards mounts auth/workspace/method/capability guards before these routes. `middleware/api-key-scope.ts:85` checks capability only; `:129` defines the separate Actor restriction check. The local fixture mounts the real method/capability middleware with a fabricated already-authenticated session; authentication and workspace lookup themselves are not bypass findings here.
- Fixture: `./node_modules/.bin/vitest run --config /workspace/scratch/actor-domain-audit/vitest.config.mts logo-actor-scope --maxWorkers=2 --minWorkers=1` → **2 passed observation tests**. No production network or database.
- Request/response 1: session `apiKeyActorIds=["actor_A"]`, scopes `actors:read,actors:write`; `GET /actors/logo-recommendations` → **200**, `data.items[0].actor.apifyActorId="actor_B"`.
- Request/response 2: same session; `POST /actors/logo-recommendations/recommendation_for_B/apply` → **200**, mocked `updateActorMetadata("actor_B", ...)` was called. The fixture DB returns a same-owner/same-workspace B row and verifies the query has no Actor restriction. Provider and logo bytes are fabricated.
- Existing six route tests exercise interactive owner/workspace behavior but do not exercise actor-restricted credentials, leaving a gate hole.
- **Ownership seam:** actor domain owner should add endpoint row filters/guards; authentication owner should reconcile the test and credential policy. This is distinct from recovery codes, session handling, and UI Enter-key 2FA dispatch. No application edits made for AD-03.

### AD-04 — recheck lifecycle can corrupt counters or remain queued

- **Medium; CONFIRMED baseline; not separately launch blocking.** It can leave affected generation/retry workflows stuck or counts negative.
- Baseline `apps/api/src/routes/actor-optimization.ts:443` resets any status without a claim; `:453` decrements `completedCount` for even `QUEUED`, `AUDITING`, `APPROVED`, `APPLYING`. At `:459` enqueue exceptions escape the null-result recovery at `:464`. The null-result case forces `READY_FOR_APPROVAL` even when all results failed (`:472`).
- Baseline scratch regression command: `./node_modules/.bin/vitest run --config /workspace/scratch/actor-domain-audit/vitest.config.mts baseline-actor-optimization --maxWorkers=2 --minWorkers=1`.
- Observed baseline assertions: active-result POST recheck → **202 rather than 409**, four statuses; a lost claim still → 202; throwing mocked enqueue → **500 rather than 503**, after the queued transition. Null enqueue marks a one-result failed run ready. Eight added assertions fail against baseline; six prior tests pass.
- **Pre-planning draft:** current `actor-optimization.ts:443` restricts terminal states; `:449` conditionally claims status/version in a transaction before counter changes; `:479` handles enqueue exceptions; failure completion is derived from counts at `:490`. Current route suite **14 passed**. Real database contention/queue-timeout ambiguity remain untested; the lost-claim unit test is not a real concurrent DB proof.
- Plan: review draft, add disposable transaction/concurrency tests and verify state/counter invariants for repeated rechecks and queue failure; no migration expected.

### AD-05 — dataset pages beyond 100,000 repeat forever

- **Medium; CONFIRMED baseline; not separately launch blocking.** Later results cannot be reached from the run viewer.
- Baseline `apps/api/src/routes/actors.ts:1024` silently clamps offset to 100,000; web run-page pagination advances from the returned offset. Request `GET /actors/by-id/a1/runs/run-1?section=dataset&offset=100020` is scoped to a fabricated owned run and receives **200 with `dataset.offset=100000`**, while `listItems` gets `{offset:100000,limit:20}`.
- Baseline regression: same scratch config, filter `baseline-actors` → the `continues dataset pagination beyond 100,000 items` assertion fails: expected 100020, actual 100000. Inputs `-1`, `1.5`, `Infinity`, `NaN`, unsafe integer also returned 200 instead of a validation error.
- **Pre-planning draft:** current `actors.ts:1028` uses the shared integer validator with a safe representable offset, fixed page size remains 20; new cases pass in the full suite. Provider behavior for extremely large valid offsets was not exercised.
- Plan: review the draft bounds, preserve fixed page size and run-parent checks, add UI forward/back pagination behavior to the regression set.

### AD-06 — key-value record selection loses list position

- **Low; CONFIRMED baseline; not launch blocking.** Selecting a record on a later key page resets the surrounding key list to page one.
- Baseline run page `apps/web/src/app/(dashboard)/dashboard/actors/[id]/runs/[runId]/page.tsx:250` builds record hrefs using section/key only, omitting `query.cursor`.
- Component test `page.test.tsx:50`: request state `section=key-value-store&cursor=result%2F50&key=result%2F51`; the baseline href has no cursor. Assertion expected `result/50`, observed `null`. Pre-change targeted run had this one DOM failure.
- **Pre-planning draft:** current page `:251` uses `URLSearchParams` and preserves cursor when adding key. Run-page suite **3 passed**. No application edit after planning-only.
- Plan: retain regression and review encoded keys/cursors and switching to the next list page.

### AD-07 — improvement result UI reports contradictory completion

- **Medium; CONFIRMED on untouched UI; not separately launch blocking.** Operators can believe failed work is applying, and completed work appears active.
- `apps/web/src/components/dashboard/actor-optimization-review.tsx:297` reads only the response error and `:299` always announces application after any 2xx. API `actor-optimization.ts:417` explicitly returns 202 with `{queued:0,failed:1}` after all enqueue attempts fail.
- Same component `:642` renders the generic generation spinner for an `APPLIED` result without error, followed by the applied confirmation at `:648`.
- Fixture command: `./node_modules/.bin/vitest run --config /workspace/scratch/actor-domain-audit/vitest.config.mts optimization-result-ui --maxWorkers=2 --minWorkers=1` → **2 passed observation tests** using the actual untouched component.
- Observed response `{status:202,queued:0,failed:1}` produced toast **"Approved changes are being applied to Apify"**. An `APPLIED` run simultaneously showed **"Generating the proposal…"** and **"Approved fields were applied to Apify."**
- Plan: UI owner should branch on queued/failed counts and render explicit queued/auditing/approved/applying/applied/failure states. No UI implementation changes here.

### AD-08 — dashboard page accepts malformed pagination

- **Low; CONFIRMED input acceptance; downstream real-DB error is SUSPECTED; not launch blocking.**
- Baseline `apps/api/src/routes/actors.ts:498` accepts fractional/nonfinite numeric page values and builds Prisma `skip` from them at baseline `:576`.
- Added baseline query regressions request `/actors/dashboard-list?page=1.5` and `?page=Infinity`; with the mocked persistence boundary, baseline returns **200** and forwards malformed pagination instead of rejecting. Five pagination-validation assertions fail (including the newly selected 100,000 page upper bound). A real Prisma/database 500 was not reproduced and is not claimed as confirmed.
- **Pre-planning draft:** current `actors.ts:499` uses `integerQuery`, consistent with the existing list endpoint's page bound, and these tests pass. Review the chosen upper bound against product policy; no source edits after the switch.

## Verified sound within the tested boundaries

- Actor run access queries ownership/workspace before obtaining the provider client; `actors.ts:975` onwards verifies `run.actId` before log/storage access. Existing negative test for another Actor returns 404. This does not certify all shared auth paths.
- Expired/unknown run fallback is keyed by `(actorId, apifyRunId)`; unknown runs without a scoped snapshot remain 404. Preserved summaries deliberately disable live-storage navigation. Existing API and component tests pass.
- Result storage uses the run's own SDK dataset/KV clients, not user-supplied storage IDs. Installed `apify-client` `run.js:324` and `:345` construct these subresources; `key_value_store.d.ts:73` documents the prefix option used in record metadata lookup. Oversize metadata prevents a normal KV preview fetch; binary content is not rendered as HTML. This is not an adversarial streaming-size audit.
- Workspace inventory reconciliation runs only after complete successful pagination. Existing tests verify provider failure/truncation does not reconcile, and removed Actor history is retained. The database admission function locks the workspace row. Real lock contention was not tested.
- Public research uses `Prisma.sql` placeholders for search/category values and a fixed sort selection; no request string is interpolated as raw SQL syntax in the reviewed function. Missing historical growth remains null, and MariaDB BIGINT output is normalized by existing tests.
- Generation excludes direct source/schema/category editing, and user-selected fields are explicitly checked before apply. Existing tests reject unsupported source/schema generation. The stale metadata guard is retained in the local draft; it was not disabled to pass tests.
- Normal owner/workspace scoping remains present on actor/detail/configuration and logo recommendation reads/writes. AD-03 is specifically the narrower Actor restriction boundary.
- Build web-boundary check passes; no backend DB/provider dependency was added to the web project. Exact runtime/source map isolation beyond the local build was not tested.

## Additional observations, policy limits, and seams

- The original `needs-attention` predicates omit `hasReadme:false` while the dedicated `missing-readme` filter includes it. The draft added that predicate in actor routes, but bulk publishing `routes/bulk-publishing.ts:137` still has the original shape. **Do not count this as an independently proven hidden-Actor bug:** normal readiness calculation sets `publishReady:false` when README is absent (`packages/shared/src/actor-publish-readiness.ts:75`), and both original predicates already include `publishReady:false`. A divergent/stale row would be needed to show extra user impact. Preserve/review the draft consistency change; coordinate both views if retained.
- `actor-env-reads.json` inventories 15 direct env reads in selected core files, names only. `APIFY_STORE_MAX_BUILDERS` is an undocumented optional scope setting. No credential values or private `.env` contents were read into this report. Full env/secret and supply-chain inventories belong to the security owner.
- Queue persistence vs timeout ambiguity and provider mutation retry/idempotency need coordinated integration coverage. No claim is made that a timeout proves a remote operation did not execute. No real remote retry was attempted.
- A successful server build does not establish first-boot migration safety or production readiness.

## SCA and installed-package evidence

Read-only `pnpm audit --json` exit **1** reported **42 vulnerability occurrences: 3 critical, 12 high, 24 moderate, 3 low** over 1,433 dependencies. Raw result: `/workspace/scratch/actor-domain-audit/pnpm-audit.json`. Its dev dependency classification is zero and must not be treated as a reliable production reachability classification. This scoped report does **not** promote raw scanner totals to launch findings; broad SCA triage belongs to the parallel security/dependency owner.

Among inspected core packages, the scanner directly named Vitest critical GHSA-5xrq-8626-4rwp (UI-server exposure) and moderate GHSA-82fw-gwwq-j7x9. Vitest is a dev dependency here; no UI server was started. Reachability of all remaining transitive advisories, compatibility of fixes, outdated-package checks, complete licence inventory, image layers and lockfile integrity remain **untriaged in this ownership**.

Installed files, not remembered versions: `node_modules/<package>/package.json` gave Apify client 2.25.0 (Apache-2.0), Hono 4.13.13 (MIT), Zod 4.6.7 (MIT), BullMQ 5.81.5 (MIT), Prisma client 6.19.3 (Apache-2.0, `postinstall` present), Next 15.5.28 (MIT), React 19.3.1 (MIT), Vitest 2.1.9 (MIT). These installed minor/patch versions may differ from minimum manifest ranges; no app install was performed. Prisma generation was run locally to enable existing generated types; it skipped environment loading and did not connect to a DB.

## Readiness, operations, and blockers

- **PASS:** local package generation/build, full typecheck/lint, script tests, observed scoped unit/DOM paths.
- **FAIL:** final test gate, due to preserved AD-02 regression. Do not merge or claim a green launch gate from this workspace.
- **UNTESTED:** empty-DB migration rehearsal, scratch production image boot, actual two-user/role HTTP DAST, cookie/CSRF/browser matrices, queue/DB concurrency, provider sandbox behavior, backups/restore rehearsal, monitoring delivery, cron timing, incident contacts. Docker is present, `docker ps` showed no running stack. No test DB/queue was provisioned or existing private environment reused. These actions were not denied or attempted with an uncertain outcome; they remain pending the readiness owner's disposable setup and scope.
- **NOT RUN:** Playwright browser checks because no local stack was started; no staging/production fallback was used. Gitleaks missing; no secret-scan gate pass.
- No live provider or payment verification is appropriate under current restrictions. Any later provider check requires an explicitly approved sandbox/test target and must preserve the prohibition on paid/live calls.
- No residual launch-blocking risk was accepted by this audit. AD-01's draft is not an integrated release, AD-02/AD-03 remain open. Nonblocking gaps are deferred for remediation, not approved as safe.

## Preserved application changes and deliverables

Exactly ten application files changed/new before planning-only:

1. `apps/api/src/routes/actor-optimization.ts`
2. `apps/api/src/routes/actors.ts`
3. `apps/api/test/routes/actor-optimization.test.ts`
4. `apps/api/test/routes/actors.test.ts`
5. `apps/web/src/app/(dashboard)/dashboard/actors/[id]/runs/[runId]/page.test.tsx`
6. `apps/web/src/app/(dashboard)/dashboard/actors/[id]/runs/[runId]/page.tsx`
7. `apps/worker/src/index.ts`
8. `apps/worker/src/lib/actor-optimization-state.ts` (new)
9. `apps/worker/test/lib/actor-optimization-state.test.ts` (new)
10. `apps/worker/test/lib/bulk-publishing.test.ts` (test-only AD-02 evidence; implementation still unfixed)

Audit documents added after the switch: this report and `docs/plans/actor-domain-remediation.md`. No other application source was changed. No branch or commit created; HEAD and branch remain as recorded.

Scratch evidence index:

- `pre-planning-changes.patch`, `preserved-source-sha256.json`: preserved work and verification.
- `baseline-original/`: four exact baseline source files with original line numbers.
- `baseline-sources/`, `fixtures/baseline-*.test.ts`, `baseline-regressions.log`: scratch imports redirected to original baseline route code; **61 prior assertions passed, 20 added assertions failed** across 81 tests. Those 20 include structural readiness/bound assertions and are not 20 independent vulnerabilities.
- `baseline-fingerprint-repro.cjs`, `baseline-fingerprint.log`: AD-01 exact baseline expression reproduction.
- `fixtures/logo-actor-scope.test.ts`, `fixtures/optimization-result-ui.test.tsx`, `seam-fixtures.log`: four passing observation tests proving AD-03/AD-07 behaviors, not correctness tests.
- `fixtures/duplicate-run-observation.test.ts`, `duplicate-run-observation.log`: bounded positive AD-02 call observation.
- `route-inventory.json`, `actor-env-reads.json`: mechanical inventories.
- `typecheck-pnpm9-path.log`, `lint-pnpm9-path.log`, `test-full.log`, `build.log`, `test-scripts.log`: full working-tree gate evidence.
- `pnpm-audit.json`, `pnpm-audit.stderr`: untriaged registry advisory output for security owner.

Remediation plan: `docs/plans/actor-domain-remediation.md`. Nothing in this report authorizes publication or implementation during planning-only.
