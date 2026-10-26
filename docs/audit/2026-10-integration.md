# ActorConsole integration record — 26 October 2026

The user has authorized scoped repository fixes, local/disposable verification, commits and normal GitHub pushes. This record supersedes the earlier audit phase's planning-only status for that work. It does not authorize changes to main, merges, deployments, production resources/data, credentials, paid effects, commercial policy or operational security settings. No residual risk is accepted and no launch-readiness claim is made.

## Repository and preservation

- Repository: `Coding-Frontend/actorconsole`.
- Verified current-main base: `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`; origin main matched before creating the integration worktree.
- Integration branch: `fixes/actorconsole-20261026`.
- Isolated integration worktree: `/workspace/actorconsole-integration`.
- Original checkout `/workspace/actorconsole` remains on `work` with its four pre-planning source/test edits and four audit/plan documents preserved. A separate private recovery snapshot was retained outside Git.
- The canonical audit and remediation documents retain the reconciled baseline findings and limits. Their historical recommendations do not describe the current integration tree's test counts.

## Published architecture batch

| Finding | Repository change | Status |
| --- | --- | --- |
| AQ-02 | Execute logo-catalog, Chrome extension and MCP suites in the coverage entry point; retain the seven existing numerical thresholds and fail-fast behavior. | Fixed and locally verified in the published batch |
| AQ-03 | Escape metric label linefeeds, emit configured zero buckets, and sort histogram output numerically. | Fixed; five focused metrics checks and aggregate gates passed |
| AQ-05 | Restrict queue/plan lookups to own properties while preserving unknown-plan Free fallback and existing entitlements. | Fixed; eight new failing baseline cases reproduced before the change; focused and aggregate gates passed |
| AQ-06 | Reject an expired cache load without deleting a newer cached/pending replacement; retain TTL, coalescing, retry and capacity behavior. Include this helper in API coverage. | Fixed; two baseline race checks reproduced before the change; six cache checks and aggregate gates passed |

Code commit: **`b538afb8fa40945efb7aa90bbf126f807d860311`**, `Fix shared utility regressions and execute omitted workspace suites`. It changes exactly 11 source/test/config files:

- `apps/api/src/lib/public-cache.ts`
- `apps/api/test/lib/public-cache.test.ts`
- `apps/api/vitest.config.ts` (add the tested helper to coverage)
- `packages/shared/src/metrics.ts`
- `packages/shared/src/metrics.test.ts`
- `packages/shared/src/plans.ts`
- `packages/shared/src/plans.test.ts`
- `packages/shared/src/queue/retry-policies.ts`
- `packages/shared/src/queue/retry-policies.test.ts`
- `scripts/test-coverage.mjs`
- `scripts/test-coverage.test.mjs`

Normal push to `refs/heads/fixes/actorconsole-20261026` succeeded; `git ls-remote` verified the exact remote code SHA above. Origin main remained `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`. No owner handoff commit was included.

| Check on this architecture code batch | Actual result |
| --- | --- |
| Focused shared / cache / runner | 40 / 6 / 7 tests passed |
| Typecheck | 16 tasks passed, including prerequisite builds |
| Configured lint and changed root scripts | 11 workspace tasks and direct zero-warning ESLint passed |
| Aggregate root tests | **1,852 passed, 3 skipped**; 232 files passed, 1 skipped |
| Expanded coverage entry point | All ten test-bearing workspace suites passed; existing numerical thresholds retained |
| Script checks | **13 tests passed** |
| Full build | 10 tasks passed, synthetic public configuration and disabled optional uploads |
| Release archive verifier / receiver syntax | 5 tests and shell syntax passed |
| Staged-diff / committed history secret scan | No leaks found; committed scan covered 16 available commits with full redaction |

The three DB tests remain opt-in skips in the default aggregate gate; no current DB integration pass is inferred. Evidence logs remain private in the task workspace; no generated outputs or scratch fixtures were committed.

The source/test batch is confined to shared metrics/plan/queue utilities, the standalone API public-cache helper, their tests, the root coverage runner and API test-coverage inclusion. No authentication, billing, Actor workflow, UI, route-label or production configuration behavior is being independently rewritten here.

## Owner integration acceptance

Only owner commits accompanied by a verified ready SHA and test receipt from the parent will be considered. Branch existence alone is not acceptance. Review each actual diff for scope, policy, new red tests and cross-owner behavior before cherry-picking; rerun affected and aggregate checks on the combined tree.

| Owner branch | Receipt / accepted commit |
| --- | --- |
| `fixes/actorconsole-20261026-auth` | Pending parent receipt; not integrated |
| `fixes/actorconsole-20261026-api` | Pending parent receipt; not integrated |
| `fixes/actorconsole-20261026-actors` | Pending parent receipt; not integrated |
| `fixes/actorconsole-20261026-billing` | Pending parent receipt; not integrated |
| `fixes/actorconsole-20261026-ui` | Pending parent receipt; not integrated |

API owns route labels for DH-03/AQ-01; the issue remains one canonical API Medium finding with architecture's earlier severity-review note. This batch handles serializer correctness, not a new arbitrary shared metric eviction policy. API cache helper/test changes here need to be preserved if the API handoff touches adjacent infrastructure.

### Shared client-address contract for AUTH-07 / DH-04

Before combined acceptance, auth and contact must consume one server-side resolver contract: a validated, normalized transport/client IP string or the fixed `unknown` bucket. Use the transport peer by default. Forwarding headers are usable only behind an explicitly verified trusted-peer/ingress contract; never infer trust from the presence of CF-Connecting-IP, X-Forwarded-For or X-Real-IP. Unresolved requests share a fixed bucket rather than a request-selected value. Preserve existing authentication/contact quotas and the separate contact email key.

Required bounded regressions cover direct/proxied requests, missing/invalid transport peer, caller header rotation, malformed/multiple values, and IPv4/IPv6 normalization. The supplied nginx examples overwrite X-Real-IP, but the deployed socket/peer chain is not verified here. No proxy, infrastructure or operational trust setting is changed; header-dependent findings remain open until the owner implementation and supported ingress contract are reviewed together. Parent will relay the shared contract to both owners.

## Environment and outstanding limits

- Available runtime: Node `24.19.0`; explicitly pinned pnpm `9.15.0`; installed Vitest `2.1.9`. The global pnpm is 11.25.0 and is not used for repository checks.
- Third-party dependencies are reused locally with isolated workspace links and Prisma-generated files. No fresh frozen install, Node22/CI parity or independent installed-tarball parity is claimed.
- AQ-04 CI database-suite activation remains open; the restrictive local DB guard is preserved. Any separately enabled disposable DB check will be reported separately from default-gate skips.
- AQ-07 installer policy and AQ-08 operational backup permissions remain outside this batch's shared utility/test-runner scope; no operational security setting was changed.
- Existing baseline SCA exposure remains for owner triage. No dependency upgrade or advisory suppression is included.
- GitHub's successful push response additionally reported **91 default-branch vulnerability alerts (14 critical, 22 high, 50 moderate, 5 low)**. That server banner is untriaged here and has a different scope from the recorded 27 production-graph advisory records; neither count is a new-code exploit count or a claim of remediation.
- The previous actual Docker build failed during Corepack's pnpm fetch. No download denial will be bypassed, no image pass inferred from Node checks, and no live provider completion claimed.
- Only normal pushes to the integration branch are authorized. Exact local/remote SHAs must be verified after each accepted batch; main remains unchanged.
