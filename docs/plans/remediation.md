# ActorConsole consolidated remediation plan

Base: **`fc52f547286b14de2f483899b4aa5dcdfca8b5ea`**, initial branch `work`. Evidence reconciled **26 October 2026**.

Status: **historical remediation/planning snapshot — no accepted residual risks.** The [canonical audit](../audit/2026-10-audit.md) records 18 canonical recommended baseline blocker IDs, conditional/policy caveats, independent verification contexts and 47 preserved files. At the audit handoff, candidate patches were uncommitted and unintegrated.

**Subsequent authorization:** the user has now authorized scoped fixes, commits and normal pushes to the isolated integration branch. The planning-only restrictions below record the earlier audit phase; current implementation and exact verification status are maintained in [the integration record](../audit/2026-10-integration.md). Main, merges, deployments, production effects and security-policy changes remain outside authorization.

This plan retains the reconciled five phases and links each owner's detailed exact-file/test-first plan. It does not invent missing file-level instructions from other workspaces. Retrieve the detailed owner plans before implementation. This document records the original planning phase; the subsequent user authorization permits scoped repository fixes, commits and normal integration-branch pushes, as recorded above. CI/security-setting changes, main updates, merges and deployment remain excluded.

## Detailed owner plans and evidence

| Owner | Exact detailed plan record | Verified evidence Page |
| --- | --- | --- |
| Authentication | `docs/plans/authentication-remediation.md` | [Authentication][auth] |
| API/data security | `docs/plans/api-data-handling-remediation.md` | [API and data][api] |
| Actor workflows | `docs/plans/actor-domain-remediation.md` | [Actor workflows][actor] |
| Billing/queues | `docs/plans/billing-queues-remediation.md` | [Billing and queues][billing] |
| UI/UX | `docs/plans/ui-ux-remediation.md` | [UI and UX][ui] |
| Architecture/test infrastructure/readiness | [Local detailed plan](architecture-readiness-remediation.md) | [Architecture and readiness][architecture] |

The architecture, Actor and UI pairs are now present in the integration checkout. Other plan paths identify their owner's source records, not claims of local inspection. Evidence Pages name exact source locations, reproductions, preserved inventories and future test-first work; use those records for session-level execution.

## Phase 1 — prepare integration without changing behavior

Owner: integration lead with all six scope owners. The original phase was a review plan. Subsequent authorization now permits reviewed, owner-scoped candidates on the integration branch; accepted changes and tests are recorded separately.

1. Review **47 preserved files** in their six task workspaces: authentication 9, API 11, Actor 10, billing 6, UI 7, architecture 4. Retain exact hashes/patch inventories and associate each change with its canonical finding. There are no exact path collisions in the reconciled inventories, but shared contracts and behavioral coupling still require review.
2. Preserve failing baseline and working-copy regressions. The Actor working copy has **1,861 passed / 1 failed / 3 skipped** with AD-02 red. UI has **570 passed / 2 failed**, versus untouched frontend **572 passed**. Do not delete, skip, weaken or rewrite expectations merely to declare a pass.
3. Agree policy-dependent behavior before selecting designs: TOTP replay acceptance, issued impersonation-session revocation, support-key scope/interactive contract, UI acceptance criteria and non-INR product offerings. Preserve existing behavior where the policy remains unclear.
4. Reproduce the intended Node22/pnpm9.15/frozen-install environment before claiming CI parity. Current baseline evidence used Node24 and reused dependencies; nested Vite5 is Vitest's transitive dependency, not proof of direct-manifest mismatch. Preserve both the untouched baseline and each working-copy test context.
5. Maintain the canonical ID register below. Count AQ-01 once as DH-03 at canonical Medium severity, with architecture's High assessment retained as a review note. Keep AUTH-07 and DH-04 separate route findings under one trusted-IP policy. Do not collapse AD-03, AUTH-06 and AUTH-04 into one generic key-scope issue.

Exit evidence: reviewed candidate/owner mapping, agreed unresolved-policy list, retained red assertions and explicit toolchain limits. No migration, deployment or behavioral change occurs in this planning phase.

## Phase 2 — close trust and credential boundaries first

Owners: authentication, API/data, Actor and shared infrastructure. Follow each linked detailed plan for exact files and first failing regression; do not independently edit overlapping middleware/shared utilities in two sessions.

| Canonical ID | Required boundary/result to prove before implementation review | Authoritative detailed owner plan |
| --- | --- | --- |
| AUTH-05 | Generic and dedicated administrator writes enforce the same privileged-target suspension rule; preserve differential ADMIN/SUPER_ADMIN denial evidence. | [Authentication][auth], `authentication-remediation.md` |
| AUTH-06 | A narrow delegated workspace key cannot inherit another workspace's browser support access. Decide interactive-only versus explicit support scope first; preserve intentional browser behavior. | [Authentication][auth], `authentication-remediation.md` |
| AD-03 | Actor-restricted keys cannot list/apply/dismiss another Actor's logo recommendations, while owner/workspace and allowed-Actor behavior remain sound. | [Actor workflows][actor], `actor-domain-remediation.md` |
| AUTH-01 | Two concurrent recovery-code claims cannot both succeed. Review the existing candidate against real disposable DB semantics and first-factor/recovery prerequisites. | [Authentication][auth], `authentication-remediation.md` |
| AUTH-02 | Logout clears/revokes presented administrator recovery and impersonation sessions according to the chosen policy. Existing candidate is not an integrated end-to-end proof. | [Authentication][auth], `authentication-remediation.md` |
| AUTH-03 | Two-factor setup/confirmation cannot overwrite enabled state or enable a secret different from the verified secret. Retain scheduled race regressions. | [Authentication][auth], `authentication-remediation.md` |
| DH-01 | Validated logo DNS destinations are the actual connection destinations; retain hostname/TLS checks, redirect policy and supported transport behavior. Use mocked/local fixtures, never private-service probing. | [API and data][api], `api-data-handling-remediation.md` |
| DH-02 | Count and cancel oversized streams before allocation at all relevant remote, API and web-proxy boundaries. Preserve signature bytes and cover earlier proxy buffering beyond the preserved API candidate. | [API and data][api], `api-data-handling-remediation.md` |
| AUTH-07 | Authentication throttle buckets derive from a verified trusted ingress address contract, not caller-selected leftmost X-Forwarded-For. Keep bounded route regressions. | [Authentication][auth], `authentication-remediation.md` |
| DH-04 | Contact requester throttling uses that same trusted-address policy while retaining independent email limits; caller CF-Connecting-IP must not select the bucket under the supported ingress. | [API and data][api], `api-data-handling-remediation.md` |
| DH-03 | One metrics fix uses registered route templates, a fixed unmatched route label and bounded methods; agree any shared-store overflow policy. AQ-01 is this issue, not another blocker. | [API and data][api] and [local architecture sessions 0A/2A](architecture-readiness-remediation.md) |

Regression order is explicit: preserve/write the failing boundary cases before changing behavior, then run focused owner tests and relevant full gates under the intended toolchain. Header-based blocker applicability must be checked against the actual supported ingress contract. No security control or test gate may be weakened to produce a pass.

## Phase 3 — make payment and Actor operations safe under retries

Owners: billing/queues and Actor workflows; integration lead coordinates shared worker/contracts. No real payments, external provider actions or load tests are authorized.

| Canonical ID | Required result and remaining evidence | Authoritative detailed owner plan |
| --- | --- | --- |
| BQ-01 | Failed/in-progress signed deliveries are safely claimable/retryable. Review the existing lease candidate with real disposable DB contention; delivery claims do not solve business-event ordering. | [Billing and queues][billing], `billing-queues-remediation.md` |
| BQ-02 | Cancellation success/rollback cannot overwrite a newer webhook state. Strengthen the legacy cancellation regression before candidate integration. | [Billing and queues][billing], `billing-queues-remediation.md` |
| BQ-03 | Durably reserve/idempotently identify checkout before external side effects and reconcile ambiguous responses. Two mocked requests are not proof of actual double collection. | [Billing and queues][billing], `billing-queues-remediation.md` |
| BQ-04 | Delayed same-subscription events cannot regress entitlement or captured/refunded ledger state. Preserve crypto checks and replacement-identity guards separately. | [Billing and queues][billing], `billing-queues-remediation.md` |
| BQ-05 | Terminal provider states lose entitlement after the recorded period, according to explicit access policy. Validate real disposable query/update behavior beyond finite in-memory fixtures. | [Billing and queues][billing], `billing-queues-remediation.md` |
| AD-02 | A timed-out wait returning RUNNING/nonterminal does not start duplicate validation work. Preserve the existing red regression, terminal-failure replacement and publication-success gate. | [Actor workflows][actor], `actor-domain-remediation.md` |
| AD-01 | Unchanged generated metadata survives generate-to-apply fingerprint comparison while genuine stale checks remain enforced. Review old-fingerprint proposals explicitly; helper parity alone is not worker/provider end-to-end proof. | [Actor workflows][actor], `actor-domain-remediation.md` |

**Conditional BQ-06, outside the 18 canonical IDs:** preserve actual provider currency/exponent before any affected non-INR Razorpay product is offered. Do not perform silent historical financial corrections; those need a separate owner-reviewed plan and data authorization. [Billing detailed plan][billing]

Durable checkout reservations, freshness state or outbox schemas need separate owner-coordinated design/migration sessions. Do not hold database transactions across provider calls, treat an enqueue timeout as proof of cancellation, or reset an ambiguous operation blindly. Migration yes/no, exact files and first regressions must come from the chosen owner design before implementation authorization.

## Phase 4 — restore complete gates and user-facing correctness

Owners: test infrastructure, UI/UX and the relevant domain owner.

1. Review the architecture runner candidate for AQ-02: include **148 omitted tests / 11 files** across logo-catalog, extension and MCP without imposing an unapproved new numeric coverage policy. Preserve the seven current thresholds and failure propagation. [Local session 1A](architecture-readiness-remediation.md)
2. Enable AQ-04's safe DB tests through an explicit approved integration setup. Preserve the restrictive target guard; fail visibly if the intended suite unexpectedly skips or runs zero cases. Future CI edits need separate authorization. [Local session 1B](architecture-readiness-remediation.md)
3. Resolve the **two UI working-copy test failures** with accessibility/behavior evidence: current pricing/SEO expectations and the new dialog semantics need reconciliation, not weakened assertions. UI baseline launch classification remains pending acceptance criteria. [UI detailed plan][ui]
4. Prioritize keyboard 2FA dispatch and interrupted verification (UI-03/04), pending draft preservation (UI-05), complete modal focus/Escape/resize-scroll lifecycle (UI-01/02) and obsolete notification-response ordering (UI-13). Server AUTH-01/02/03 remediation and UI Enter dispatch remain distinct work.
5. Repair remaining palette/docs keyboard access, contrast, pending accessible labels, failed-close retry context and privacy link behavior. Preserve UI-10 as suspected and UI-12 as rejected unless materially new evidence warrants reassessment. [UI evidence and exact plan][ui]
6. Address accounting/unknown-versus-zero synchronization (BQ-07/08), enqueue uncertainty (BQ-09), Actor recheck/counters/navigation/UI and pagination (AD-04/05/06/07/08), notification method scopes (AUTH-04), public diagnostics/signature/schema validation (DH-05/06/07), and shared/cache/backup findings (AQ-03/05/06/08) in their detailed owner sessions.
7. Align installer policy AQ-07 with the selected package manager only after its offline lifecycle regression and explicit dependency/security-owner review. No toolchain upgrade or security-setting change is authorized here. [Local session 1C](architecture-readiness-remediation.md)

Prioritize contract fixes before broad refactors. Duplicated helpers, large modules, potential dead code and suspected scaling limits require parity tests and measured local evidence; they are not blanket permission for rewrites. The local architecture plan supplies exact shared utility/test infrastructure, cache and backup sessions; other scope details remain in the linked owner plans.

## Phase 5 — complete release evidence

Owner: release/readiness lead, with dependency, operations, domain and product owners.

- **Actual containers:** diagnose the Corepack pnpm fetch failure without disabling TLS/integrity checks. Build and boot the actual production targets against fresh disposable services, inspect image contents/users/notices and repeat readiness. The current successful guarded Node boot must not be relabelled container readiness. [Local session 0B](architecture-readiness-remediation.md)
- **Fresh-install parity:** verify the intended Node22/pnpm9.15/frozen-install environment. Existing hashes verify 1,208 tracked source files, not every installed tarball or a newly created dependency tree.
- **SCA:** triage SMTP-reachable Nodemailer advisories and nested build/provider/tooling paths by actual vulnerable operation and attacker-controlled input. The 27 production-graph advisory records and Actor's 42 full-scan occurrences are not additive. Do not mute findings or force broad overrides to lower counts. Review lifecycle policy, licenses and final distributed notices. [Local sessions 3A/3B](architecture-readiness-remediation.md)
- **Golden paths:** complete approved local/sandbox authenticated/browser/provider flows with expected rows/events/emails. Provider purchase/cancel/refund, OAuth, email delivery and catalog work are not proven by mock fixtures or blocked-network boot. No production/live payments, paid provider calls or external bypass are authorized.
- **Operations:** assign owners and obtain evidence for monitoring delivery, uptime, log retention, encrypted/offsite restore, incident contacts, schedule visibility and historical issuer-side credential revocation. Current backup rehearsal restored a marker and migration history, but did not test encryption or offsite storage/access. [Local Phase 4](architecture-readiness-remediation.md)
- **Known evidence gaps:** deduplicate against the historical private audit when available; do not manufacture a launch checklist or infer revocation from a clean scan of 15 available commits.

Exit evidence is an explicit recorded result for each required release check and a product/security decision on any remaining proposal. **No residual risk is accepted by these plans.**

## Canonical ID register and integration controls

| Area | Canonical recommended baseline blocker IDs | Count | Planned phase |
| --- | --- | ---: | --- |
| Authentication | AUTH-01, AUTH-02, AUTH-03, AUTH-05, AUTH-06, AUTH-07 | 6 | Phase 2 |
| API/data | DH-01, DH-02, DH-03, DH-04 | 4 | Phase 2 |
| Actor workflows | AD-01, AD-02, AD-03 | 3 | AD-03 Phase 2; AD-01/02 Phase 3 |
| Billing/queues | BQ-01, BQ-02, BQ-03, BQ-04, BQ-05 | 5 | Phase 3 |
| **Canonical total** | **18 unique IDs** | **18** | |

Conditional BQ-06 is outside that total; AQ-01 is the DH-03 alias; UI findings await product acceptance policy rather than an invented security-blocker count. AUTH-07 and DH-04 retain ingress-contract caveats. Independent working-copy test totals must not be summed or used as an integrated-gate result.

Before each later session: retrieve its exact owner plan/evidence, agree nonoverlapping file ownership and policy, preserve the first failing regression, determine migration requirements, and confirm the action remains within the subsequent implementation authorization. Resolve any new policy decision separately. After implementation: run focused and required broader checks, retain failures/limits, review integrations and record the exact changed files. No release follows merely from completing a code candidate.

**Historical phase:** the original documentation consolidation applied no candidates and made no application edits, branches, commits or pushes. **Current phase:** scoped implementation, commits and normal integration-branch pushes are authorized and underway; see [the integration record](../audit/2026-10-integration.md) for exact accepted commits and checks. Main, merge, deployment, production and excluded security-policy actions remain prohibited. No residual risk is accepted.

[auth]: https://chatgpt.com/space/page_8f254d9db4048191a69226b58e9ff6c6
[api]: https://chatgpt.com/space/page_0ab9e088c08081919ac52f9326b68a03
[actor]: https://chatgpt.com/space/page_382efae268b8819195d1cee0e645c1b1
[billing]: https://chatgpt.com/space/page_d31a571d41bc819196ee8937f28cf107
[ui]: https://chatgpt.com/space/page_0f61a03b281481918b6fd9d32a90571d
[architecture]: https://chatgpt.com/space/page_87953ef8901c8191a0ed1a0ddf427e2b
