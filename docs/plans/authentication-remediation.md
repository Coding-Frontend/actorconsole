# Authentication remediation plan

Baseline: `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`, branch `work`, `/workspace/actorconsole`. Implementation, reviewable commits and publication of `fixes/actorconsole-20261026-auth` are now authorized by the subsequent user instruction. AUTH-01 through AUTH-07 have independent fixes in `aa848d537d3d77d52149577a6219cdff2257bd01`, with the API-owner resolver dependency recorded in the handoff. AUTH-08/AUTH-09 remain unapplied policy candidates, not resolved defects. Findings, reproductions and validation limits are in `../audit/2026-10-authentication-audit.md`. UI Enter-key two-factor dispatch is a separate UI-owner item.

Each phase below fits a focused session. Do not merge, deploy, alter production state, change security settings or create provider credentials as part of this plan. Use mocked requests and disposable local databases. Preserve existing browser behavior where product policy is undecided.

## Explicit policy decisions and compatibility

**AUTH-08 existing contract:** `README.md` describes two-factor authentication; the existing implementation conditionally claims each five-minute login challenge once and accepts the current/adjacent TOTP steps. Neither the README nor the runbook promises that one TOTP value is rejected across separate challenges or across sign-in and account-security actions. Recovery-code single use (AUTH-01) is a separate, independently fixed guarantee. Thus the new durable counter is a stronger product contract, not an already documented behavior.

**AUTH-08 proposal:** `authentication-policy-candidates/totp-policy-candidate.patch` contains the exact tested implementation and regressions. It adds a nullable `User.totpLastUsedStep` and migration `20261026080000_totp_replay_protection`; existing accounts begin at null, with secrets/recovery codes unchanged. Verification still accepts ±1 time step, but only a step greater than the stored one can authorize another operation. Confirmation records its step; the same value then cannot immediately sign in, disable 2FA or regenerate recovery codes. A fresh accepted step or a recovery code is needed. Accepting a future skew step also prevents moving backwards. These cross-challenge/cross-action consequences require a product decision and UI messaging review. **The migration and behavior are absent from primary source.**

**AUTH-09 existing contract:** creation and recovery require an active ADMIN/SUPER_ADMIN, protected administrator requests recheck current authority, and mimic sessions have a maximum 15-minute lifetime. No located document explicitly guarantees that an already issued derived lease terminates on operator demotion/suspension or on revocation of one original browser session. The original audit therefore held this as a policy decision.

**AUTH-09 proposal:** `authentication-policy-candidates/impersonation-policy-candidate.patch` checks the originating administrator's current role/suspension/deletion state on protected and public session reads, and deletes derived sessions on administrator suspension/demotion. This can end an existing lease early. It needs no schema migration, preserves ordinary sessions and the 15-minute upper bound, but does not link a mimic to one parent browser session; single-parent-session revocation would need a separate schema/design decision. Confirm whether immediate account-authority revocation or lease-until-expiry is intended before integrating it. **This behavior is absent from primary source.**

Both patches were tested together before isolation: 95 focused tests passed, the full suite passed 1,885 tests with 3 pre-existing skips, configured typecheck/lint/coverage/build passed, and disposable MariaDB verified atomic TOTP/recovery claims. Those results describe the candidate tree, not the final primary tree. Both patches passed `git apply --check` against the final primary tree after the AUTH-07 import was introduced. The TOTP patch preserves that verified-IP plumbing. Neither changes a deployed service or production data. Rebase/retest after integration decisions and the API dependency.

## Phase 0 — recovery, logout, factor races and notification scopes (implemented)

**AUTH-01, AUTH-02, AUTH-03, AUTH-04. Migration: no.**

Review the exact nine-file patch at `/workspace/scratch/auth-audit/preserved-app-edits.patch` against the report's baseline evidence. Do not treat it as already integrated. Source candidates are `apps/api/src/lib/server-session.ts`, new `lib/two-factor-recovery.ts`, the two-factor sections of `routes/account.ts`, the guard in `routes/notifications.ts`, and `routes/web-auth/signout.ts`.

The first regression cases already written are:

- Distinct login challenges concurrently consume one recovery code: exactly one session/cookie succeeds; revoked codes and challenge replay fail.
- Concurrent recovery-code regeneration: one response succeeds and its returned code list matches storage.
- Setup arriving after concurrent enabling and confirmation after pending-secret replacement: 409 with no factor overwrite.
- Logout revokes every distinct supplied current/original token and removes recovery cookies, including when the mimic cookie expired.
- Legacy notification read-only key cannot mutate; write-only cannot read; granular permissions and documented legacy compatibility remain intact.

Validation: focused 61-test command in the report, API tests, full tests, configured lint/typecheck. Re-run the two-transaction MariaDB fixture if the CAS implementation changes. Extend real-engine coverage to simultaneous different recovery codes and transaction rollback before accepting the candidate. Document that a failed recovery-code race consumes its login challenge and returns the existing 401; determine whether client retry messaging needs the UI owner's follow-up. Do not change that UI in this scope.

Docs: security-recovery guarantees in `README.md` or a dedicated auth design note; keep the audit's candidate/integration status current. Ownership: server authentication, with notification guard coordination if the API owner is editing that route.

## Phase 1 — administrator hierarchy (implemented)

**AUTH-05. Launch blocking. Migration: no.**

Files: `apps/api/src/routes/admin.ts` generic PATCH and suspension actions; optionally a new `apps/api/src/lib/admin-user-authorization.ts` for shared policy; `apps/api/test/routes/admin.test.ts` and/or a dedicated authorization regression file.

Write the failing test first using actual `requireAdmin`: ADMIN → SUPER_ADMIN, dedicated suspend = 403 and generic PATCH `suspendedAt` = 403 with zero writes/audits. Also cover ADMIN → other ADMIN, valid SUPER_ADMIN → USER suspension, self-suspension/demotion, and an explicit un-suspension. Preserve ordinary profile edits allowed by existing policy.

Extract the existing dedicated-route privileged-target rule, apply it when PATCH changes suspension state, and use the same policy for every suspension/unsuspension route. Use the same session-revocation behavior for generic and dedicated suspension. Retain strict schemas, self-lockout and last-super-admin protections. Do not invent new administrator powers. Review the combination of role and suspension fields in one PATCH.

Verify the scratch differential reproduction now denies both routes, all role tests pass, and no other owner is changing the relevant handler. Update the auth policy/design documentation and audit finding status. Keep deployment configuration untouched.

## Phase 2 — support credential boundary (implemented)

**AUTH-06. Launch blocking. Migration: no for an interactive-only boundary.**

Files: auth guards for `/tickets` in `apps/api/src/app.ts` or `routes/tickets.ts`, `middleware/auth.ts` if reusing the existing interactive boundary, `test/routes/tickets.test.ts`, and a full-app API-key authorization fixture. Coordinate exact edited lines with the support/API owner before work.

First tests: a key bound to workspace A with only `actors:read` cannot list/read workspace B's tickets, reply to them or change their state. Include a ticket from a different user. Assert rejection before any provider/email/database mutation. Browser account-wide support behavior must remain covered and unchanged.

Recommended minimal policy is rejecting API keys at support routes via `requireInteractiveSession`, because no support capability currently exists. This preserves account-wide interactive support while enforcing the existing promise that workspace automation keys do not replace account sessions. If product needs API-key support, explicitly add ticket read/write capabilities, key-workspace predicates on all ticket/message operations and corresponding MCP/API documentation; do not silently grant support powers under `actors:read` or `mcp`.

Verify collection, detail, reply, assignment/status/priority paths, with the normal browser support and admin workflows. Update `apps/mcp/README.md`, public API documentation and auth design notes if the credential contract changes. Reconcile duplicate support findings by referencing AUTH-06.

## Phase 3 — trusted client IP resolution (implemented against the owner dependency)

**AUTH-07. Launch blocking for supplied ingress topology. Migration: no.**

Files: API-owner `apps/api/src/lib/client-ip.ts`, export `resolveClientIp(c)`, `apps/api/src/routes/web-auth.ts:60`, authentication login-event IP extraction in `lib/server-session.ts`, and all other API rate-bucket call sites inventoried by the API owner. Proxy files `.deploy/nginx-web.conf`/`.deploy/nginx-http.conf` and the web proxy are separate-owner changes requiring coordination; this phase must not edit them under an auth-only assignment.

First regression: the bounded 32-request scratch case must end in 429 after rotating the untrusted leftmost value while the trusted peer identity stays fixed. Add small functional cases for absent headers, multiple proxy hops, IPv4-mapped IPv6, equivalent IPv6 spellings and malformed/oversized forwarded values. Do not perform load testing.

Design one explicit trust contract: the outer trusted ingress overwrites a canonical identity header, and the API accepts it only through that configured ingress. Do not assume the first forwarded header entry or any publicly supplied `x-real-ip` is trustworthy. Retain per-account failure/code attempt limits, Redis atomic limiting and production fail-closed behavior. Verify direct untrusted API access cannot choose another bucket.

Update `deployment.instructions.md`, environment examples if configuration is introduced, and the runbook with exact proxy-hop assumptions. Validate the complete local proxy → web → API chain before marking resolved. Deployment/security settings remain unchanged during planning.

## Phase 4 — TOTP replay policy (unapplied candidate; decision required)

**AUTH-08. Product risk decision pending. Migration: yes for durable per-user step state.**

Files: `packages/shared/src/totp.ts`, `packages/db/prisma/schema.prisma`, a new forward migration, `apps/api/src/lib/server-session.ts`, account second-factor verification and their tests. Coordinate schema changes with database ownership.

First tests: separate valid login challenges with the same TOTP step yield one session; concurrent same-step claims also yield one; accepted previous/current/next drift steps cannot move the durable accepted counter backwards; wrong/expired challenges do not consume a valid future step. Define whether step reuse across sign-in and account security actions is prohibited and test the chosen policy consistently.

Return the matched step from verification and atomically claim a monotonic counter bound to the factor's secret/version. Reset that state safely on replacing/disabling a secret. A process-local Map is insufficient across replicas. Preserve deliberate clock tolerance and recovery-code handling. Verify on MariaDB and through password and social login, without contacting Firebase.

Document the replay window and chosen policy; retain AUTH-08 as pending until the product decision and tests are complete. Do not conflate this with UI form dispatch or recovery-code races.

## Phase 5 — derived-session revocation (unapplied candidate; decision required)

**AUTH-09. Product risk decision pending. Migration: no for administrator-authority checks; yes if linking each mimic to a parent session.**

Files: `apps/api/src/middleware/auth.ts`, `lib/web-session.ts`, administrator suspension/role-change/session-revocation actions in `routes/admin.ts` and `routes/account.ts`, plus impersonation tests. Avoid broad handler rewrites.

First tests: valid mimic succeeds; suspended/demoted/deleted originating admin fails; dedicated and generic administrator suspension revoke or deny all derived sessions; expiration and original-session recovery continue to work. Define whether revoking one original browser session also revokes only its derived sessions or all sessions created by that administrator.

For immediate authority revocation, validate the originating user's current role and account state and delete/deny derived sessions by `impersonatedById`. Apply the same rule to both public web-session reads and protected requests. If parent-session-specific semantics are required, introduce a parent reference with migration/backfill and bounded lifetime. Document the 15-minute lease versus immediate-revocation promise explicitly.

## Phase 6 — resolve policy-dependent hardening and finish validation

Mixed-cookie selection: standardize `middleware/auth.ts`, `lib/web-session.ts`, `middleware/admin.ts` and cookie lifecycle helpers only after deciding legacy migration behavior. First test must supply two valid cookies for different users and require the same selected identity at all boundaries. Session cap, idle timeout, and sensitive operations during impersonation need explicit product policies before changes. Forward nested logger-redaction concerns to the observability owner with the report's source evidence.

Restore the configured pnpm 9.15.0 local runner in an approved writable tooling location without changing repository dependencies or gates. Typecheck, package lint, unit tests, configured seven-project coverage thresholds, MCP/extension bundles and isolated frontend compilation passed individually in this audit; preserve that evidence. The final configured root build and staged Gitleaks checks now pass; retain the three skipped integration tests as skipped until genuinely run. The historical all-ref scan passed before the documentation commit; its post-commit result is recorded in the final chat handoff. Production container readiness, migration-from-empty, browser golden paths, real email/Firebase verification and all non-auth SCA/readiness work remain with their designated owners. Never promote a component compilation or unit-suite pass into whole-product launch clearance.

Cross-owner deduplication: retain the actor-domain report as canonical for `GET /actors/logo-recommendations` and `POST /actors/logo-recommendations/:id/apply` missing Actor restrictions. This is distinct from the legacy notification method guard and support workspace boundary. Do not implement an actor-logo fix from this plan. Fold the API owner's contact `CF-Connecting-IP` issue into Phase 3's shared IP trust contract, while retaining AUTH-07's separate `/auth/*`/`X-Forwarded-For` reproduction.

Handoff deliverables: this file, the historical audit with current-status addendum, regression tests, unapplied policy-candidate patches, and `/workspace/scratch/auth-audit` evidence. The source user instruction authorizes only normal publication of the named handoff branch; no main push, merge, deployment or live effect is included. Candidate patches remain unapplied in executable source and must not be treated as resolved findings.
