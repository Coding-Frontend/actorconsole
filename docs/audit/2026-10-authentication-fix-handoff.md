# Authentication fix handoff — 2026-10-26

## Branch and integration order

- Repository: `Coding-Frontend/actorconsole`; original verified main baseline `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`.
- Handoff branch: `fixes/actorconsole-20261026-auth`.
- Auth implementation commit: `aa848d537d3d77d52149577a6219cdff2257bd01` (`fix(auth): close recovery, session and authorization gaps`). This is the auth-only commit to integrate.
- Dependency source revision: `b1f5db62b3e5b4f754380a564bed1f5eb94a7430`. It was inspected and copied, without modification, as local dependency commit `d09c873cabf33203b60c2f9e9dbe10d6d64d9f67` with a `cherry picked from` trailer.
- The coordinator reports that dependency is already mapped to `ca2ecb2231a21c453f27df96c61be572946827f7` on integration checkpoint `b933833f75c703198c7bb784150a3c93043dc830`. **Skip the local dependency copy when integrating auth.** Apply only the auth implementation and separate documentation commit.
- Only this handoff branch was pushed, normally. The first push's `git ls-remote` matched `aa848d537d3d77d52149577a6219cdff2257bd01`; the final documentation-head ref is recorded in the chat handoff. No main push, merge, deployment, production request/data mutation, real provider call, credentials issuance or production trust-setting change occurred.

## Finding status

| ID | Severity | Baseline launch recommendation | Handoff status and evidence |
| --- | --- | --- | --- |
| AUTH-01 | Medium | Block: single-use recovery violation | Fixed: JSON-list CAS tied to the factor version; one of two concurrent logins succeeds. Disposable MariaDB also verifies rollback and remaining-code handling. |
| AUTH-02 | High | Block: administrator recovery survives logout | Fixed: revoke every distinct presented current/original browser token and clear recovery cookies, including after the mimic cookie expires. |
| AUTH-03 | High | Block: factor verified and factor enabled can differ | Fixed: conditional setup/confirm and factor-version-bound disable/regeneration. Two additional action-version race tests fail before the fix and pass afterward. |
| AUTH-04 | Medium | Remediate; bounded notification exposure | Fixed: enforce legacy method scopes and retain granular capability checks and documented empty-scope compatibility. |
| AUTH-05 | High | Block: lower administrator can suspend super administrator | Fixed: all suspension-state writes share the existing privileged-target rule; generic suspension atomically revokes the user's direct sessions like the dedicated route. Ordinary profile edits remain available. |
| AUTH-06 | Medium | Block: delegated credential escapes workspace/capabilities | Fixed: support uses the existing interactive-session boundary. Eight API-key paths fail before data access or mutation; browser account-wide support remains unchanged. |
| AUTH-07 | Medium | Block for unverified forwarding topology | Fixed in source: consume the API owner's transport-peer resolver for the unchanged 30/15-minute quota; pass the same verified result through server-only request metadata into login events. 31 sequential requests cannot evade quota by rotating headers. |
| AUTH-08 | Medium | Product decision pending | **Not resolved.** Tested durable per-factor TOTP-step proposal is an unapplied patch only. Its migration is not in the active migration directory. |
| AUTH-09 | Medium | Revocation-policy decision pending | **Not resolved.** Tested immediate administrator-authority/derived-session revocation proposal is an unapplied patch only. Existing mimic semantics remain active. |

The initial nine edited source/test files were inspected against their preserved SHA-256 inventory before new implementation began. The earlier audit and red-test evidence are retained in `2026-10-authentication-audit.md`; the implementation grant superseded planning-only for independent fixes, while the later explicit policy hold kept AUTH-08/AUTH-09 isolated. Neither root-suite success nor optional candidate test success resolves those decisions.

## Exact behavior and limits

`routes/web-auth.ts` calls API-owner `resolveClientIp(c)` and uses that canonical value for the auth quota. `lib/auth-request-ip.ts` is a WeakMap carrying that server result by Request identity; it does not interpret headers or implement another IP resolver. Bare Requests without verified metadata record null for login IP. The API resolver's exact-peer allowlist defaults empty, and no installation value was activated. Behind an untrusted proxy, clients conservatively share the proxy peer bucket; absent socket metadata shares `unknown`. Actual ingress/peer-chain verification remains an operational check before enabling per-client proxy trust; see API-owner `docs/CLIENT_IP_TRUST.md`.

Recovery-code CAS conflicts can require a fresh login challenge; a failed competing claim does not issue a session or resurrect the code. Factor changes return the existing 409-style conflict response instead of modifying a different factor. No commercial, plan, retention, ordinary browser-support, legacy empty-key-scope or existing mimic lease policy was broadened.

AUTH-08's proposal would require a schema migration and could reject a TOTP reused after enabling 2FA, between distinct sign-in challenges, or between security actions; a fresh accepted step/recovery code would be needed. AUTH-09's proposal would terminate existing mimic leases early on originating administrator suspension/demotion/deletion; no current document explicitly guarantees that behavior. The precise contracts and decisions are in `docs/plans/authentication-remediation.md`. Do not apply either proposal without the user's answer.

## Validation matrix

The final primary source, including the unchanged API dependency and excluding both proposals, passed:

| Command/check | Result |
| --- | --- |
| `pnpm test` | 237 files passed, 1 skipped; **1,884 tests passed, 3 pre-existing integration tests skipped**. |
| `pnpm typecheck` | 16 Turbo tasks passed. |
| `pnpm lint` | 11 configured package tasks passed. |
| `pnpm test:coverage` | All seven configured package thresholds passed unchanged; API lines/statements 90.66%, shared 94.07%, AI 88.19%, Apify 83.33%, DB 100%, worker 98.59%, web 99.36%. Include lists still omit some auth libraries, so percentages do not imply complete auth coverage. |
| `pnpm build` | 10 build tasks passed; generated backend, MCP, extension and frontend artifacts only. Local API URL, disabled telemetry/upload credentials and an external-network-blocking preload prevented application/provider production requests during this local build. |
| `pnpm test:scripts` | 6 passed, 0 failed/skipped. |
| Focused independent auth set before IP consumption | 81 passed across six files. |
| API resolver/auth integration set | 24 passed across five files, including the API-owned resolver/contact fixtures and four new auth requester cases. |
| Staged Gitleaks 8.30.1 | No leaks in the 19 explicitly staged implementation files. The repository-pinned binary's download checksum was verified. |
| Git whitespace | `git diff --check` passed. |
| Empty disposable MariaDB 10.11 migrations | Every active migration applied successfully to new loopback-only `auth_primary_clean`; no TOTP proposal migration was active. |
| Real primary recovery login | Actual Prisma + auth completion: statuses `[200,401]`, exactly one stored session; rollback preserved an unused code; replay denied; different valid codes drained without resurrection. |
| Optional proposal tree (historical, not shipped as behavior) | 95 focused and 1,885 full-suite tests passed with 3 skips; configured build/typecheck/lint/coverage passed, and MariaDB verified TOTP claims. These results are explicitly not primary-tree policy clearance. |

New reproductions failed before their relevant fixes: 18 assertions in the initial administrator/support/authority fixture set (the authority proposal was later isolated); 2 factor-action version assertions; 4 auth-IP quota/audit-IP assertions. Baseline audit regressions for the earlier candidates failed 9 assertions and passed after correction. The TOTP proposal's four expected pre-fix failures remain a proposal, not a resolved finding.

pnpm 9.15.0 and checksum-verified Gitleaks 8.30.1 were placed only under `/tmp/actorconsole-auth-tools`; no dependency manifest/lockfile or gate was weakened. Initial automatic pnpm 11 setup failed with ENOENT, and an initial scan without the repo allowlist flagged existing synthetic fixtures; using the required pinned runner and unmodified repository scan configuration corrected those setup invocations. Isolating the optional TOTP migration initially left an empty local migration directory, which Prisma correctly rejected; that empty artifact was removed and the complete migration chain was rerun against a fresh disposable database. The first documentation scan also classified a public dependency revision under an API label as a generic key; its known Git revision metadata label was clarified and the same unmodified scanner was rerun. Final logs distinguish these attempts.

A delayed parent callback reported a prior-turn failure without exposing its underlying cause. Before the documentation commit/publication, local log and remote refs were rechecked: both matched the successful auth commit, main remained at the original baseline, and no merge/cherry-pick/revert/sequencer operation was pending. No denied action was retried.

Raw sanitized logs and local test fixtures remain in `/workspace/scratch/auth-audit/evidence/` and `/workspace/scratch/auth-audit/recovery-primary-db.mts`. No approval action was denied and no external mutation has an uncertain outcome.

## Exact auth implementation files (19)

- `apps/api/src/lib/admin-user-access.ts`
- `apps/api/src/lib/auth-request-ip.ts`
- `apps/api/src/lib/server-session.ts`
- `apps/api/src/lib/two-factor-recovery.ts`
- `apps/api/src/routes/account.ts`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/routes/notifications.ts`
- `apps/api/src/routes/tickets.ts`
- `apps/api/src/routes/web-auth.ts`
- `apps/api/src/routes/web-auth/signout.ts`
- `apps/api/test/lib/server-session.test.ts`
- `apps/api/test/routes/account.test.ts`
- `apps/api/test/routes/admin-user-authorization.test.ts`
- `apps/api/test/routes/admin.test.ts`
- `apps/api/test/routes/notifications.test.ts`
- `apps/api/test/routes/ticket-auth.test.ts`
- `apps/api/test/routes/tickets.test.ts`
- `apps/api/test/routes/web-auth/client-ip.test.ts`
- `apps/api/test/routes/web-auth/session-flow.test.ts`

## API-owned dependency files (9; copied unchanged)

- `.env.example`
- `.env.vps.example`
- `apps/api/src/config/env.ts`
- `apps/api/src/lib/client-ip.ts`
- `apps/api/src/routes/contact.ts`
- `apps/api/test/config/env.test.ts`
- `apps/api/test/lib/client-ip.test.ts`
- `apps/api/test/routes/contact-abuse.test.ts`
- `docs/CLIENT_IP_TRUST.md`

## Documentation/review artifacts

- `docs/audit/2026-10-authentication-audit.md`: historical evidence plus superseding implementation status.
- `docs/audit/2026-10-authentication-fix-handoff.md`: this exact source/test/dependency handoff.
- `docs/plans/authentication-remediation.md`: implemented phases and precise outstanding policy decisions.
- `docs/plans/authentication-policy-candidates/totp-policy-candidate.patch`: unapplied AUTH-08 implementation, migration and tests.
- `docs/plans/authentication-policy-candidates/impersonation-policy-candidate.patch`: unapplied AUTH-09 implementation and tests.

Both proposals passed `git apply --check` against the final primary tree. This is applicability checking, not execution or approval.

## Remaining work and coordination

- AUTH-08/AUTH-09 need explicit user policy decisions. Their code is reviewable but unapplied, with no corresponding active migration or broadened access rule.
- Actual ingress addressing is unverified; no proxy trust was activated. Integration/operations must verify the real peer chain before configuring trust, without inferring it from repository templates.
- The three pre-existing integration skips, real email/Firebase/browser golden paths, production image boot/restore and global SCA/readiness are not cleared by this scope. The GitHub push banner reported 91 default-branch dependency alerts (14 critical, 22 high, 50 moderate, 5 low); that banner is not a reachability audit and is referred to the existing SCA owner rather than counted as new auth findings.
- The actor-logo Actor-A/Actor-B restriction gap stays with the actor owner; it is distinct from AUTH-04 method-scope handling and AUTH-06 support credential boundaries. Contact requester throttling is API-owned and shares the resolver dependency; do not duplicate its finding or commit.
- No deployment, main push, integration merge, production-data operation, paid call or security-setting activation occurred. The integration coordinator remains responsible for combining the auth implementation and documentation commits with its already-present API dependency.
