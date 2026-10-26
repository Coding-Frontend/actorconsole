# Architecture, shared infrastructure and readiness remediation plan

Base: `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`.

Evidence and status: [scoped audit](../audit/2026-10-architecture-readiness-sca.md). Exact fixtures, logs and the preserved patch are under `/workspace/audit-artifacts/architecture-quality`.

This is **planning only**. Do not implement this plan, create a branch/commit, change CI/security settings or deploy under the current instruction. Four source/test files edited before that instruction remain uncommitted; review them as a concrete existing diff, not as authorization for additional edits. No dependency upgrade or domain refactor has been applied. Each numbered session below is sized for a separate implementation/review session; unrelated owners should not edit the same files concurrently.

## Phase 0: reconcile launch blockers and validation limits

### Session 0A — one canonical metrics-cardinality fix (AQ-01)

Owner: API/data owner, with shared-infrastructure review. This is already in the API/data report's launch-blocker list: **count once**.

- Exact production files: `apps/api/src/app.ts`; review `packages/shared/src/metrics.ts` for a separately agreed storage-overflow policy.
- Regression first: add an API integration test alongside `apps/api/test/app-csrf.test.ts` or a new `apps/api/test/app-metrics.test.ts`. Send exactly three anonymous requests to distinct unmatched short paths; assert all return 404 and use one fixed not-found metric label. Send two requests to the same parameterized route with different valid IDs using existing auth/DB fixtures; assert the label uses the route template. Include long, short, punctuation and encoded path forms in bounded cases.
- Reference the existing three-request scratch fixture `app-cardinality.mjs`; its 3-versus-1 assertion currently fails.
- Implementation: derive route labels from a trusted registered route template; use a constant unmatched-route label and a bounded method vocabulary. Do not use arbitrary client path/header strings as metric dimensions. Preserve request IDs and useful request logs. If a global shared series ceiling is added, specify deterministic overflow metrics and test them separately; do not silently evict arbitrary metric history.
- Migration: **No**.
- Verification: focused API test, shared metrics suite, API typecheck/lint, full root tests and existing coverage gate. The three-path scratch assertion must pass. No load test is needed or authorized.
- Docs: update the scoped finding and canonical parent issue; record the label vocabulary and overflow decision in repository operations documentation.

### Session 0B — complete actual container readiness (RD-01)

Owner: release/readiness owner. This is a **verification blocker**, not a demonstrated application-code defect.

- Inputs: untouched baseline `Dockerfile`, `.dockerignore`, lockfile and the failed `docker-api-build.log`. The failing step is Corepack's pnpm 9.15.0 fetch at Dockerfile:14.
- First verification: diagnose registry connectivity and certificate trust from the intended build environment using a harmless registry request. Preserve TLS and package-integrity checks. Do not disable verification, inject live credentials, rewrite the Dockerfile or route around denied access to force a pass.
- Once normal approved connectivity works, build API, worker, MCP and web targets using only synthetic public frontend build settings. Tag only task-local images. Record base and image digests, installed package inventory and runtime users. Inspect layers/context for private environment files.
- Boot images against a new disposable MariaDB/Redis pair and local ports. Keep outbound provider access blocked. Verify API readiness, web health/home, unauthenticated admin denial and worker initialization, then stop all test services.
- Migration: **No schema change**; apply the existing 73 migrations to a fresh test schema and repeat deployment to verify no pending migrations.
- Verification: image build/boot results are distinct from the already passing Node production boot; update the report only with actual results.
- Docs: update readiness evidence and `docs/RUNBOOK.md` only if operational steps change. CI/CD changes are outside this chat's authorization.

## Phase 1: restore regression execution and explicit toolchain policy

### Session 1A — review/integrate the preserved runner patch (AQ-02)

Owner: test infrastructure.

- Exact files already edited: `scripts/test-coverage.mjs`, new `scripts/test-coverage.test.mjs`.
- Regression first: keep the manifest-driven assertion that every workspace with a `test` script is invoked, failure/termination/launch-error propagation, and the unchanged seven 60% line/statement thresholds. Consider one explicit failure in the first newly added suite as well as the last suite before extending the patch.
- Implementation: review the existing patch, which adds logo-catalog, Chrome extension and MCP as unit suites without imposing an unapproved numeric coverage policy. Avoid changing workflow files. Preserve pnpm 9.15 argument forwarding; the existing `--` forwarding was verified sound and is not a bug to fix.
- Migration: **No**.
- Verification: `node --test scripts/test-coverage.test.mjs`, `pnpm test:scripts`, focused ESLint on both root scripts, `pnpm test:coverage`. Expected complete test totals with the preserved metrics changes are 1,835 passed / 3 skipped until Session 1B addresses the DB gate.
- Docs: document that the command runs ten suites, with seven selected coverage gates. Update parent integration records with exact files and test counts.

### Session 1B — activate isolated database coverage without weakening its guard (AQ-04)

Owner: test infrastructure plus CI/integration owner. **This session proposes coordination; no CI edit is currently authorized.**

- Exact files to review: `apps/api/test/intelligence.integration.test.ts`, `apps/api/vitest.config.ts`, root test scripts, and `.github/workflows/ci.yml` as read-only input until a CI owner is authorized to change it.
- Regression first: add tests for the DB-target guard: absent marker, mismatched URLs, non-loopback host, wrong schema, unrelated database query parameters, and explicitly allowed disposable target. Assert destructive tests remain disabled for every disallowed target. Do not loosen the guard to arbitrary URLs merely to match an existing job.
- Implementation decision: either provide a dedicated integration-test command with a deliberately named disposable database and matching marker, or coordinate a CI-owner change to provision that target and invoke the command. Require the integration step to fail if it unexpectedly runs zero tests or skips the expected suite.
- Migration: **No new migration**. Existing migrations must execute against an empty test database first.
- Verification: all 73 apply; `test/intelligence.integration.test.ts` reports 3 passed and none skipped; verify test rows clean up and another workspace remains isolated. Repeat the normal root gate and record its skip semantics accurately.
- Docs: add the safe local command and target constraints to `CONTRIBUTING.md` or a test-infrastructure document; update the parent audit's readiness table.

### Session 1C — make install-script policy match the pinned package manager (AQ-07)

Owner: dependency/toolchain owner. Do not change security policy or tool versions in this planning phase.

- Exact files: `package.json`, `pnpm-workspace.yaml`, associated root script tests. Lockfile changes only if a later, separately reviewed tool/dependency change actually requires them.
- Regression first: retain/rebuild the offline local file-dependency fixture. An approved synthetic dependency may run its harmless marker script; an unapproved one must not. Assert zero registry downloads and inspect marker existence. Run with the repository's actual pinned pnpm.
- Proposed minimal implementation for pnpm 9.15: express the intended allowlist using the supported `pnpm.onlyBuiltDependencies` root-manifest configuration, with an explicit reviewed list based on real installed scripts. Remove the misleading unsupported setting only after parity is demonstrated. Do not silently upgrade pnpm to make the syntax work.
- Migration: **No database migration**. Review frozen-lockfile behavior if configuration changes affect snapshots.
- Verification: offline policy fixture, an isolated frozen install, Prisma generation, native dependency availability, full build/typecheck/tests. Both installed esbuild versions and native binary requirements need coverage. Never turn off the restriction when a native dependency fails; resolve the exact required package.
- Docs: document the pinned toolchain and how to review a new install script in `CONTRIBUTING.md`; update SCA evidence.

## Phase 2: utility correctness and cache/backup reliability

### Session 2A — review the preserved metrics serialization patch (AQ-03)

Owner: standalone shared utility owner. Coordinate with Session 0A to avoid concurrent edits to `metrics.ts`.

- Exact already edited files: `packages/shared/src/metrics.ts`, `packages/shared/src/metrics.test.ts`.
- Regression first: retain the three tests for combined newline/quote/backslash labels, zero-count buckets and high-then-low numeric bucket order. They failed before the preserved change and pass after it.
- Implementation review: confirm escaping occurs exactly once, all configured buckets are emitted cumulatively, and `+Inf` matches count and remains last. Preserve existing names/labels and reset behavior. Do not add an arbitrary cardinality policy in this small serializer change.
- Migration: **No**.
- Verification: focused metrics tests, shared typecheck/lint, full shared coverage and root test gate. Keep the recorded baseline 173 shared tests distinct from WIP 176.
- Docs: update AQ-03's integration status and reference the Prometheus exposition contract.

### Session 2B — constrain shared lookup keys (AQ-05)

Owner: shared utilities, with entitlement-owner review for unchanged fallback behavior.

- Exact files: `packages/shared/src/queue/retry-policies.ts`, its existing test; `packages/shared/src/plans.ts`, its existing test.
- Regression first: test `constructor`, `toString`, `__proto__`, `hasOwnProperty`, a normal unknown string and each valid queue/plan. Unknown queue names must return undefined. Every unknown plan string must retain exactly the current Free fallback, including the same feature result.
- Implementation: own-property checking before lookup. Do not change Free/Pro entitlements, queue retry values, unknown-plan policy or caller authorization.
- Migration: **No**.
- Verification: convert the first two cases of `shared-contracts.test.mjs` into repository behavioral regressions; shared test/typecheck/lint plus API/worker checks. Document that current typed callers constrained external reachability.
- Docs: audit status and helper contract comments if clarification is needed.

### Session 2C — preserve newer public-cache entries when an old load fails (AQ-06)

Owner: API/data owner. This scope supplies evidence only.

- Exact files: `apps/api/src/lib/public-cache.ts`; add a dedicated `apps/api/test/lib/public-cache.test.ts`.
- Regression first: reproduce the deferred A / expired TTL / successful B / rejected A sequence from the third scratch contract test. Assert two loader calls, not three, and retained B. Also cover ordinary rejection retry, same-key cold-miss coalescing, TTL expiry and the existing 256-entry bound.
- Implementation: capture the specific promise and remove an entry on failure only if the current entry still owns that promise. Preserve rejection propagation and the current TTL/key semantics. Do not replace the complete cache layer.
- Migration: **No**.
- Verification: focused tests with fake time, API checks, relevant builder/research cache tests, complete gate. Use deferred promises, not sleep or network traffic.
- Docs: update canonical API issue and AQ-06 cross-reference; no public API behavior change expected.

### Session 2D — make manual backup output restrictive and test restoration (AQ-08)

Owner: operations/scripts owner.

- Exact files: `scripts/backup-db.sh`, new root Node/Python script regression, `docs/RUNBOOK.md`; review `scripts/restore-db.sh` without unrelated rewrites.
- Regression first: with umask 022 and disposable client adapters, run a backup containing a synthetic marker. Assert archive permissions are owner-only and a newly created directory is private; assert temporary client config cleanup on success/failure. Restore to a separate disposable schema and verify the marker and migration records. Preserve explicit destructive-restore confirmation.
- Implementation: restrictive script-local umask and explicit creation permissions as needed. Avoid changing permissions on an existing shared backup directory without an agreed operator policy. Explicitly document optional encryption/offsite settings and distinguish local compressed backup from encrypted storage.
- Migration: **No**.
- Verification: regression, `bash -n`, backup/restore rehearsal; no production data, cloud storage, new encryption identity or provider credentials. Verify receiver invocation still works and retains its existing 077 protection.
- Docs: update the runbook's direct invocation and permission/encryption requirements; record tested target and restore result.

## Phase 3: SCA triage and incremental performance/refactor work

### Session 3A — SMTP dependency exposure

Owner: API/worker email owner plus dependency owner.

- Exact files: API/worker manifests, `apps/api/src/lib/email.ts`, worker email tests, and `pnpm-lock.yaml` if an upgrade is selected. Coordinate any worker entry-file change with its domain owner.
- Regression first: enumerate the options actually passed to Nodemailer. Use local SMTP/fake transport fixtures for recipient parsing, reply-to, From, list headers, disabled file/URL access and attachment/raw options that are actually supported. Do not invoke external SMTP or send real mail.
- Reconcile all 18 Nodemailer advisories with those paths; retain advisory severity and application reachability as separate fields. Select a compatible patched release with evidence; do not assume a major bump is safe or that an old-major patch fixes every advisory.
- Migration: **No** unless a later selected application redesign requires one; none is proposed here.
- Verification: frozen install in an isolated copy, email/API/worker tests, build/typecheck/lint; repeat the audit and record residual advisories rather than muting them.
- Docs: dependency change notes, exact compatibility result and residual accepted-by-user decisions if any. No risk is accepted by this plan.

### Session 3B — nested build/provider/tooling dependencies and distribution inventory

Owner: dependency/release owner, separate from SMTP work.

- Exact inputs: manifests/lockfile, nested Next PostCSS, Firebase Firestore gRPC, Prisma config/deepmerge, Apify proxy/PAC/get-uri/basic-ftp, Tailwind selector parser; Dockerfile and notices are review targets.
- First verification: resolve affected packages from their actual parent module, not only from root. Reconfirm imports/options and test which vulnerable operation is reachable. No exploit testing against providers.
- Plan compatible parent-package upgrades or narrowly justified overrides only after focused contracts and full builds pass. Keep incompatible major migrations as separate sessions; never broadly override every nested version merely to reduce audit counts.
- Inventory final images for lifecycle scripts, runtime users, build-only tooling, licenses and emitted font/icon notices. Consider a separate migration-tool image before pruning backend runtime dependencies. Treat mutable base tags and root backend users as explicit hardening decisions, not evidence of a current exploit.
- Migration: **No** for pure compatible dependency updates; Prisma major changes require their own separately reviewed migration plan.
- Verification: exact nested resolutions, relevant unit suites, full build, frozen install and repeated SCA; compare final artifact contents and notices. Image work remains blocked until Session 0B is possible.
- Docs: update `THIRD_PARTY_NOTICES.md` and dependency/toolchain records only for actual changes.

### Session 3C — profile catalog queries before moving pagination

Owner: API/catalog owner.

- Exact files to inspect: `apps/api/src/lib/builders.ts` around aggregation/sort/pagination and snapshot queries, `actor-research.ts`, relevant Prisma indexes.
- Regression first: construct a small disposable catalog with ties, unavailable earnings, multiple snapshots per day, incomplete days and filter boundaries. Capture expected rankings, coverage and pagination. Protect “unknown” versus zero behavior.
- Collect query plans and individual local query timings on that fixture. No load test. Only then choose database aggregation/materialization/index changes or caching improvements. Keep browser/UI code untouched.
- Migration: **Possibly**, only if measured query plans justify an index/materialized schema change. Create an isolated migration session if needed.
- Verification: equivalent results for all supported sorts/windows and dates, query-plan evidence, relevant DB integration tests and full gates.
- Docs: describe measured limitation and resulting query shape, not unmeasured performance promises.

### Session 3D — remove proven duplicates and dead code in owner-sized slices

Owners: web/catalog/content/shared utilities as applicable; no overlapping domain-file edits.

- Start with one pure contract per session: RSS (`apps/api/src/lib/changelog-feed.ts`, web counterpart), research filters (API/web counterparts), or portfolio trend calculation (API/web builders). Keep DB/fetch code with its owner.
- Regression first: run identical behavioral fixtures against both implementations and capture any intentional differences. Move the shared pure implementation into a browser-safe shared subpath only after resolving differences. Preserve text/attribute/URL escaping distinctions for any email helper extraction.
- For dead-code candidates listed in the audit, verify static and dynamic imports, framework registration, build entry points and test-only uses. Remove only confirmed unused code and move meaningful tests to the active implementation. Retain the research view's `pricingEntries` dependency.
- Large module extraction is a separate session per domain: admin routes, Actor operations, worker publishing, extension sidepanel, usage-cost UI. Do not combine these with a security fix or apply unrelated formatting.
- Migration: **No** for pure extraction/removal.
- Verification: import/bundle checks, focused domain regressions, typecheck/lint/build and complete tests. Compare baseline bundle output before claiming reduced payload.
- Docs: record named owners and the new shared boundary; update architecture documentation if added.

## Phase 4: operational sign-off and ownership

One operations session should produce installation evidence for uptime probes, log rotation/retention, Sentry/OTEL delivery, offsite encrypted backup/restore, worker schedule visibility and an incident contact roster. These are not verified by configuration presence alone. Use local/sandbox fixtures or pending-user-verification steps where issuer/hosting access is required; no production probing is authorized here.

Historical credential revocation is already documented in `docs/CREDENTIALS.md`. Link it as a known item, obtain issuer-side confirmation from the authorized owner, and do not repeat it as a newly discovered leak. Current history scanning found no leaks in the 15 available commits; it does not establish old-remote cleanup or issuer revocation.

Assign explicit maintainers for `packages/config`, root build/test scripts, shared observability, shared email primitives, logo-catalog, MCP package contracts, Chrome extension, dependency/distribution review and backup/restore. This plan does not assume another chat's ownership is absent merely because no CODEOWNERS file exists.

Parent handoff: consolidate AQ-01 with the API/data canonical finding; merge this plan with the parent remediation document by ID/owner; retain the isolated baseline gate evidence and the separate preserved-WIP totals. No further implementation should occur until the user's planning-only instruction changes.
