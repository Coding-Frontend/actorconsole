# BQ-S2 publishing lease follow-up — 2026-10-26

> Integration review: verified owner commit `9df78b103ea934fbbd610babb8f6dbac2dd375d3` is imported selectively, with bulk scratch logs/JSON retained on the [owner evidence branch](https://github.com/Coding-Frontend/actorconsole/tree/9df78b103ea934fbbd610babb8f6dbac2dd375d3/docs/audit/evidence/billing-queues/bq-s2/). BQ-S2 is separate from the 18 original canonical blocker IDs; BQ-S1 and AUTH-08/09 remain unchanged. [The integration record](2026-10-integration.md) holds current combined gates and publication receipts.

The coordinator independently extracted the actual pre-follow-up wrapper from `5ed40a162a08840c6f1db3594eade893287ec918`, `apps/worker/src/index.ts:447`. Nine 15-minute virtual steps allow a second owner at two hours plus one millisecond while the first remains active: `secondAcquired=true`, `overlap=true`. The exclusivity assertion fails as expected, with zero provider calls. This is an extracted-wrapper reproduction, not a full worker deployment.

The merged validation helper retains AD-02's terminal/unfinished-run predicates (including TIMING-OUT/unknown) and adds the new lease checks. The one merge conflict was resolved by checking the lease before validating the completed-wait state. **37 focused checks pass**, including 23 validation tests, eight lease tests and six leader-lock tests. The additional lease check calls the installed BullMQ `Job.prototype.shouldRetryJob` and verifies `[false,0]` despite remaining attempts. The actual schedule processor returns the publishing promise directly, preserving this error class.

**Five bounded real-Redis checks also pass:** exclusion, TTL renewal, rejection of a stale token, ownership-safe release and fail-closed guarded work after a replacement token is installed. No provider call occurs. This extends the owner's in-memory evidence to actual Lua execution; failover, network partition, paused-process/provider overlap and in-flight cancellation remain untested or impossible as stated below. No exactly-once guarantee is introduced. Coordinator logs/fixture scripts remain outside Git under `integration-bq-s2-*`.

## Outcome and scope

**BQ-S2 is CONFIRMED, Medium, and fixed in this separate follow-up.** A publishing job can exceed its one-hour Redis lock and the API's two-hour active-run check. The bounded two-worker fixture reproduced a second owner while the first worker was still active. This is a release blocker for enabling overlapping, long-running publishing jobs across worker consumers: duplicate validation/publication actions can consume provider resources and race shared schedule state. No cross-account access or actual provider charge was demonstrated. The coordinator owns integration and rollout; this report does not claim deployment.

- Repository: `Coding-Frontend/actorconsole`, `/workspace/actorconsole`.
- Branch: `fixes/actorconsole-20261026-billing`.
- Follow-up base and dependency: `ac5649bf6cdec57c0d0754687f47edf0b86ad6ed`, the already published BQ-01–09 batch. Original audit baseline: `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`.
- At follow-up start the worktree was clean and the remote billing branch matched `ac5649bf6cdec57c0d0754687f47edf0b86ad6ed`. The final handoff records the new commit and verified remote SHA. The earlier batch is preserved as the parent commit.
- Only the publishing lock's expiry, ownership and action checkpoints are changed. **BQ-S1 commercial/access policy is unchanged.** No migration, dependency, configuration, credential or CI change is required.
- Tests use fake time, an in-memory Redis fixture and mocked provider methods. No provider, production, load-test or deployment request was made.

## Reachable baseline and local reproduction

Line references in this paragraph are against the exact follow-up base `ac5649bf6cdec57c0d0754687f47edf0b86ad6ed`:

1. `apps/worker/src/index.ts:866` enters `runBulkPublishSchedule`; `:868` acquires a one-hour lock. The work runs at `:889`; release occurs only in `finally` at `:891`. There is no renewal or ownership checkpoint during work.
2. `apps/worker/src/lib/bulk-publishing.ts:23` allows a 900-second validation wait per Actor. `:31` waits for an existing run; `:37` can start another run and `:38` waits again. `packages/apify/src/client.ts:1346` passes `waitSecs` to the installed client's `waitForFinish`. Installed `node_modules/apify-client/dist/resource_clients/run.js:308` delegates to `_waitForFinish`; `node_modules/apify-client/dist/base/resource_client.js:64` implements the polling wait. This is not constrained to a single 60-second HTTP request.
3. `apps/api/src/routes/bulk-publishing.ts:50` permits up to 100 Actors per run. The forced-run route at `:933` only rejects a RUNNING record with `startedAt` in the last two hours (`:946`). A nine-Actor run with 15-minute waits is still active after this guard ages out.

The original acquire/work/release wrapper was extracted without renewal, then run with two logical workers sharing one fake Redis store. Worker one performs nine mocked Actor steps, each waiting 900,000 virtual milliseconds. At two hours plus one millisecond, worker two attempts the same schedule. Worker one is asserted to remain active. The exclusivity assertion then fails: **expected `second.acquired` false; received true**. The red test took about 12 ms of real test time; no two-hour wall-clock test or real provider action occurred. This red run is an extracted baseline-wrapper reproduction, not a claim that a deployed server or untouched full application was exercised.

Command: `node node_modules/vitest/vitest.mjs run apps/worker/test/lib/publishing-lease.test.ts`. Result before renewal: **1 failed test**. See [the preserved red log](https://github.com/Coding-Frontend/actorconsole/tree/9df78b103ea934fbbd610babb8f6dbac2dd375d3/docs/audit/evidence/billing-queues/bq-s2/red-reproduction.txt). The original source wrapper with numbered lines is preserved in [baseline-source.txt](https://github.com/Coding-Frontend/actorconsole/tree/9df78b103ea934fbbd610babb8f6dbac2dd375d3/docs/audit/evidence/billing-queues/bq-s2/baseline-source.txt). After the fix, the same long-run assertion passes in the seven-case lease suite.

## Minimal ownership/renewal fix

- `apps/worker/src/lib/leader-election.ts:38` adds atomic compare-token-and-EXPIRE renewal. It cannot extend another owner's token. Existing compare-token-and-delete release is retained; other leader locks do not acquire automatic heartbeats.
- `apps/worker/src/lib/publishing-lease.ts:44` owns the publishing lifecycle. The TTL remains one hour, renewed every 20 minutes and at explicit action checkpoints. Renewal/release commands are bounded to five seconds. A conservative monotonic deadline and sticky loss state prevent a late response or paused worker from resurrecting its lease.
- `apps/worker/src/index.ts:871` uses this helper while preserving the existing duplicate-run skip result. Checkpoints around validation, lifecycle/publication calls, Actor/schedule writes and progress prevent subsequent guarded work after ownership loss. The handler only finalizes its own RUNNING history row as FAILED with `PUBLISHING_LEASE_LOST`; it does not rewrite a new owner's shared schedule/Actor state after detecting loss.
- `apps/worker/src/lib/bulk-publishing.ts:19` accepts an optional ownership guard around each validation-run request and long wait, including before starting a replacement run.
- Lease loss extends BullMQ `UnrecoverableError`. The installed implementation at `node_modules/bullmq/dist/esm/classes/job.js:511` excludes this error from automatic retry even with attempts remaining. Release errors cannot mask the original task failure. This suppresses automatic retries of the failed queue job; it does not disable future scheduled/manual jobs.

## Owner verification and evidence (independent receipt)

| Check | Result |
| --- | --- |
| Baseline-wrapper red reproduction | 1 failed assertion, intentionally preserved |
| Focused lease, validation-run and leader-lock suites | 3 suites, **22 passed** |
| All worker tests after final handler guards | 13 suites, **94 passed** |
| Full workspace test suite | **236 suites passed, 2 skipped; 1,879 tests passed, 32 skipped** |
| All package typechecks | **11 passed**, exit 0 each |
| All package lint scripts | **11 passed**, zero-warning gate retained |
| Worker build and backend ESM postprocessing | Passed |
| Script tests | **6 passed**, none skipped |
| Secret scan and whitespace checks | History and staged diff scans passed with redaction; diff checks passed; publication receipt records final commit/ref |

The 32 skipped tests are 29 opt-in billing SQL/Redis cases and three existing intelligence database cases. Disposable services were not recreated for this fake-only follow-up. The earlier batch's successful real-disposable SQL/Redis and fresh-migration evidence remains historical and is not counted as rerun here. No new schema exists to migrate. The worker is the only changed runtime package; the full frontend/other-package production builds and browser acceptance were not repeated.

Exact commands, counts and gate exit codes are in [validation.txt](https://github.com/Coding-Frontend/actorconsole/tree/9df78b103ea934fbbd610babb8f6dbac2dd375d3/docs/audit/evidence/billing-queues/bq-s2/validation.txt), with green test summaries and package gate JSON alongside it. Full raw logs remain under `/tmp/actorconsole-billing-audit/bq-s2-*.log` in the task environment. The existing loopback-only network guard was enabled for tests. Package scripts were invoked with installed local binaries because the environment's pnpm launcher attempts a non-workspace bootstrap; no package or gate was changed to bypass it.

Verified sound within this fixture:

- A long active owner excludes a second worker beyond both expiry thresholds.
- A process paused beyond expiry cannot resume guarded actions or delete the replacement owner's lock.
- Redis renewal rejection and hanging renewal fail closed; late replies cannot restore local ownership.
- A stale token cannot renew/release a replacement; the current token can extend its TTL.
- Different schedule keys remain independent; timers are cleaned up; release failure preserves the task error.
- Ownership loss during an existing validation wait cannot start a replacement run. Loss while starting a validation run prevents the next provider call.

## Residual limits and handoff

**The fix cannot cancel, retract or determine the outcome of a provider request already in flight.** There is no transaction spanning Redis, SQL and the external provider. A process pause between a successful guard and a request, or a request still in flight when the lease is lost, remains an uncertain external outcome. The change stops subsequent guarded actions and the queue job's automatic retry after detected lease loss; it does not promise exactly-once provider execution or durable provider-side fencing.

Before manually retrying or allowing a future scheduled attempt after `PUBLISHING_LEASE_LOST`, inspect the original job/run IDs and the current provider Actor/validation-run state using the normal authorized reconciliation process. Do not blindly repeat a possibly accepted external action. No automatic cleanup, financial decision or new retry policy for future schedules was introduced.

The Redis fixture checks command shape and models atomic token comparison/TTL; actual Redis failover, network partition and Lua execution were not exercised here. The full booting worker/DB/provider flow was not started; the handler's checkpoint wiring and unique-run history write were source-reviewed, while the extracted lifecycle and validation helper were executed. The integration coordinator should retain that coverage distinction. BQ-S1 still requires an explicit entitlement decision and is outside this follow-up. There is no denied or pending authorization action blocking this change.

## Combined coordinator acceptance

The combined tree passes **2,123 tests with 3 expected intelligence DB skips**, including **29 enabled billing SQL/Redis cases**. Intelligence separately passes **3/3**. Typecheck **16 tasks**, lint **11**, **13 script tests**, web boundary, all **10 coverage suites** and the **10-task synthetic production build** pass. Existing coverage includes and thresholds remain unchanged. All 74 combined migrations pass on fresh disposable schemas; the independently checked baseline still has 73, with the same two unrelated schema drifts preserved. The initial startup-related migration failure is retained and explained in the integration record. Task-owned services were removed afterward. No image/provider/browser/failover pass is inferred.

The integration follow-up imports 12 necessary owner paths and adds the coordinator's BullMQ interoperability assertion and documentation updates, for 15 changed paths. The source commit and exact verified remote ref are recorded in the integration publication receipt. AUTH-08/09 and BQ-S1 remain unapplied policy holds. No residual risk is accepted.
