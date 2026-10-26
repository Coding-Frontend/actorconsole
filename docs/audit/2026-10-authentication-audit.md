# Authentication and authorization audit — 2026-10-26

## Implementation handoff status — supersedes historical workspace status below

Implementation, commits and publication of the dedicated handoff branch were subsequently authorized. Active branch: `fixes/actorconsole-20261026-auth`; base remains `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`. The original audit and its before/after evidence below are retained as historical records, not a statement that planning-only remains active.

AUTH-01 through AUTH-07 have committed fixes and regressions in auth commit `aa848d537d3d77d52149577a6219cdff2257bd01`. AUTH-07 consumes the final API-owner `apps/api/src/lib/client-ip.ts` / `resolveClientIp(c)` contract, from dependency `b1f5db62b3e5b4f754380a564bed1f5eb94a7430` (local cherry-pick `d09c873cabf33203b60c2f9e9dbe10d6d64d9f67`). The integration branch already has that dependency; do not apply the copy twice. AUTH-08 and AUTH-09 remain policy-dependent and **are not marked resolved**: their tested implementations were removed from executable source and preserved as unapplied review patches in `docs/plans/authentication-policy-candidates/`. No TOTP counter migration or immediate derived-session revocation behavior is active in the primary fixes. See `docs/plans/authentication-remediation.md` for the exact consequences and decisions.

The seven independent fixes preserve browser account-wide support while rejecting automation keys at its interactive boundary; apply the existing privileged-target suspension rule to alternate write paths; use conditional factor-version writes; claim recovery codes once; clean up logout recovery cookies; enforce legacy notification method scopes; and use the API-owned verified requester identity for auth quotas and login-event metadata. They require no schema migration. Final results and exact files are in `2026-10-authentication-fix-handoff.md`; the code commit was pushed normally and its remote ref verified.

## Scope, baseline and change boundary

Repository: `https://github.com/Coding-Frontend/actorconsole.git`, checkout `/workspace/actorconsole`, initial branch `work`, initial and audit-phase final HEAD `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`. `git ls-remote origin refs/heads/main refs/heads/master` returned that exact SHA for `main`. The initial worktree was clean. During the original audit phase, no branch, commit, push, merge, deployment, CI/CD change, production request, paid provider call or production data access was made. No production website domain was inferred.

The initial instruction authorized scoped fixes. A subsequent instruction changed this phase to **planning only**. Implementation stopped on receipt. The nine source/test files listed below were already edited and are preserved, uncommitted. All later code fixtures and the frontend build copy are scratch artifacts outside application source. This report distinguishes the original baseline, preserved candidate changes, and unchanged implementation.

Read: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/CREDENTIALS.md`, `docs/RUNBOOK.md`, `deployment.instructions.md`, environment examples and the actual CI gate. No `AGENTS.md`, `CLAUDE.md`, local `.agents/skills`, known-issues document, launch checklist or architecture document was found in the checkout or mounted instruction directories. The historical credential-revocation reminder in `docs/CREDENTIALS.md` is an existing pending verification item, not a new finding. Its issuer-side status was not tested.

Ownership is server authentication/authorization only. The UI Enter-key two-factor form dispatch issue is owned by the UI audit and is **not** any finding below. API support handling and reverse-proxy configuration are coordination seams; this audit changed neither while planning only.

## Historical audit result (before implementation)

Nine confirmed findings: three High and six Medium. Six baseline findings are recommended launch blockers: AUTH-01, AUTH-02, AUTH-03, AUTH-05, AUTH-06 and AUTH-07. Three have locally tested candidate changes preserved from the earlier authorized phase; three remain unchanged. Local fixes are not integrated or deployed, and launch clearance is not claimed.

The five priorities are the administrator hierarchy bypass (AUTH-05), API-key access outside its workspace/capabilities (AUTH-06), administrator recovery surviving logout (AUTH-02), two-factor setup races (AUTH-03), and spoofable authentication rate buckets (AUTH-07). AUTH-01 also needs integration because a recovery code must authorize at most one use.

| ID | Finding | Severity | Status | Recommended launch block | Audit-phase workspace |
| --- | --- | --- | --- | --- | --- |
| AUTH-01 | Recovery codes can authorize concurrent requests twice | Medium | CONFIRMED | Yes: violates single-use account recovery | Preserved candidate, focused and disposable MariaDB checks pass |
| AUTH-02 | Logout leaves saved administrator session recoverable | High | CONFIRMED | Yes: successful logout can retain administrator access | Preserved candidate, focused checks pass |
| AUTH-03 | Two-factor setup/confirmation races replace or confirm a changed factor | High | CONFIRMED | Yes: the enabled factor can differ from the factor verified | Preserved candidate, focused checks pass |
| AUTH-04 | Legacy notification keys bypass method scopes | Medium | CONFIRMED | No: bounded notification integrity/read exposure; remediate | Preserved candidate, focused checks pass |
| AUTH-05 | Generic user PATCH bypasses privileged-account suspension policy | High | CONFIRMED | Yes: lower administrator can suspend a super administrator | Unchanged; plan only |
| AUTH-06 | Actor-only workspace credential reads account-wide support tickets | Medium | CONFIRMED | Yes: credential crosses explicit workspace and capability boundaries | Unchanged; coordinate support API owner |
| AUTH-07 | Caller-controlled forwarded IP resets authentication rate bucket | Medium | CONFIRMED | Yes for supplied proxy topology: public auth throttle is spoofable | Unchanged; coordinate proxy/API owner |
| AUTH-08 | TOTP value is reusable across separate login challenges | Medium | CONFIRMED | No automatic block: first factor remains required; product risk decision pending | Unchanged; plan only |
| AUTH-09 | Existing impersonation ignores administrator authority revocation | Medium | CONFIRMED | No automatic block: bounded by existing 15-minute lease; revocation policy decision pending | Unchanged; plan only |

Severity describes impact with the stated prerequisites; it does not imply unauthenticated account takeover. No residual risk has been accepted on the user's behalf.

## Reproduction commands and evidence

Commands below use the existing installed tools directly. The provided `pnpm` is 11.25.0 rather than configured 9.15.0; its first invocation attempted an automatic dependency operation and failed with `ENOENT` creating `/home/agent/.local/share/pnpm`. This was a setup failure, not an approval denial. No access denial was bypassed. Node is 24.19.0; the configured minimum is 22.12.0.

From `apps/api`, focused reproduction command:

```sh
node ../../node_modules/vitest/vitest.mjs run test/lib/server-session.test.ts test/routes/account.test.ts test/routes/web-auth/session-flow.test.ts test/routes/notifications.test.ts
```

Before source changes the same four files were run in two invocations: **9 failed, 52 passed**. Evidence is in `/workspace/scratch/auth-audit/evidence/actorconsole-auth-regressions-before.log` and `actorconsole-auth-account-before.log`. After the preserved changes: **61 passed** in `actorconsole-auth-regressions-after.log`.

Remaining findings are reproduced against actual Hono routes/guards and crypto code with database results mocked and provider calls absent. From any directory:

```sh
node /workspace/actorconsole/node_modules/vitest/vitest.mjs run --config /workspace/scratch/auth-audit/vitest.config.mts --root /workspace/scratch/auth-audit
```

Result: **5 passed**; each test asserts the undesirable observed behavior, so this is reproduction success, not a security gate pass. Source: `/workspace/scratch/auth-audit/remaining-auth.test.ts`; evidence: `/workspace/scratch/auth-audit/evidence/actorconsole-auth-scratch.log`. The IP check makes exactly 32 local functional requests, sequentially: 30 allowed, one denied, one with a different forwarded IP allowed. No load test was performed.

### AUTH-01 — concurrent recovery-code claims

Baseline reachable paths: password/social sign-in → `apps/api/src/lib/server-session.ts:137` (baseline lines 139–156); security actions → baseline `apps/api/src/routes/account.ts:103`, with unconditional removal at line 117. Separate valid login challenges independently read the same code list and perform unconditional writes. The challenge's own single-use check does not serialize the user's recovery-code list across different challenges.

Failing baseline assertion: expected login statuses `[200, 401]`, received `[200, 200]`; two sessions were created. Concurrent `POST /2fa/recovery-codes` likewise returned `[200, 200]` instead of `[200, 400]`. Tests: `test/lib/server-session.test.ts`, first test; `test/routes/account.test.ts`, `two-factor credential races`.

Additional real-engine evidence: a fresh, loopback-only `mariadb:10.11` container named `actorconsole-auth-audit-fc52f54`, empty `auth_audit` database, generated Prisma client 6.19.3 and schema push. Scratch `recovery-db.mts` compares the baseline read/unconditional-write sequence with the preserved helper in two simultaneous transactions. Output: `{"disposableMariaDb":true,"baselineClaims":2,"preservedEditClaims":1,"remainingCodes":1}`. See `evidence/actorconsole-auth-recovery-db.log`. This tests the exact database update semantics; it is not a full live login flow. The container was stopped and removed after the test.

Impact requires the first factor and a recovery code (or an existing session for account actions). A recovery credential is nevertheless promised as single use and can authorize more than one operation. Candidate uses a JSON-list compare-and-set in `src/lib/two-factor-recovery.ts:4`, shared by login and account verification, and retains the challenge claim. No migration. Integration still requires review; no further implementation is authorized in this phase.

### AUTH-02 — logout retains administrator recovery

Baseline `apps/api/src/routes/web-auth/signout.ts:18` chooses one of two current-session cookies, revokes only that token and clears only those two cookies. It never reads `actorconsole.original-session`. The unchanged recovery endpoint `src/lib/session-recovery.ts:6` and exit endpoint `routes/web-auth/impersonate-exit.ts:19` accept the saved valid administrator session.

Reproduction fixture: `POST /auth/signout` with current mimic, alternate legacy session and saved administrator cookies returns 200, but the baseline database call is only `{where:{sessionToken:"mimic-token"}}`. With only the original-session cookie, it makes no revocation call at all. Both assertions failed before source changes. The reachable follow-up `/admin/impersonate/exit` can restore the still-valid administrator session even when the mimic token is gone. Requires a browser already in an administrator's impersonation session; no cross-user token guessing is asserted.

Candidate revokes all distinct presented current/original session tokens and clears both impersonation recovery cookies. Tests assert the exact revocation set and four deletion cookies; both pass after the preserved edit. No migration. See `test/routes/web-auth/session-flow.test.ts:109` and the focused logs.

### AUTH-03 — two-factor state changes are not conditional

Baseline setup checks `totpEnabled` at `routes/account.ts:720`, then unconditionally writes a new encrypted secret at line 732. Another request can enable the previous secret between the read and write. The later setup write changes an enabled factor and clears recovery codes without verifying the new factor. Confirmation at baseline lines 760–785 verifies a loaded secret, then enables the current row without checking whether its secret changed.

Failing assertions: a setup request whose initial read says disabled while the current row is enabled returns **200 rather than 409**, overwriting the factor; a confirmation whose pending secret was replaced returns **200 rather than 409**, enabling the replacement. Both are bounded scheduled-race fixtures in `test/routes/account.test.ts`, not repeated racing traffic.

Candidate updates only rows still disabled; confirmation additionally matches the encrypted secret that was verified (`routes/account.ts:727`, `:775`). The two race tests now return 409, and the normal confirmation still returns eight recovery codes matching storage. No migration. The UI form dispatch issue is unrelated and remains with the UI owner.

### AUTH-04 — legacy notification method-scope escape

Baseline `routes/notifications.ts:242` has authentication but no method-scope guard; mutations at baseline line 375 invoke `assertApiKeyCapability`. In `middleware/api-key-scope.ts:70`, capability enforcement applies only when a scope contains `:`. Therefore legacy `read`/`write` scopes are not enforced there. `app.ts:259` supplies authentication and workspace resolution, with no outer method check.

Requests with a legacy read-only API-key context: `POST /notifications/n_1/read` and `POST /notifications/read-all` both return **200 rather than 403** and reach `notification.updateMany`. A write-only key also passes the read boundary and reaches data queries; the original fixture lacked read results and returned 500, so no claim of a successful baseline read response is made. The confirmed observation is that authorization did not stop the query.

Candidate adds `requireApiKeyMethodScope({allowGranularMcp:true})` to this route. New tests cover both denied mutations, denied read, allowed legacy write, granular write, intentionally compatible empty legacy scopes, and denied granular read-only mutation. No migration; do not silently remove documented empty-scope compatibility.

### AUTH-05 — administrator hierarchy bypass through PATCH

Untouched reachable implementation: `app.ts` mounts `adminRoutes`, which uses `requireAdmin`; `routes/admin.ts:575` permits `suspendedAt` in the generic PATCH schema. Its role restriction at `:587` checks only a change to `body.role`. The suspension write at `:615` accepts an ADMIN changing a SUPER_ADMIN's `suspendedAt`. The dedicated `POST /users/:id/suspend` explicitly denies that same caller/target at `:641`.

Scratch test uses a real ADMIN session and SUPER_ADMIN target: `POST /admin/users/super-admin/suspend` → **403**; `PATCH /admin/users/super-admin`, JSON `{"suspendedAt":"<valid ISO timestamp>"}` → **200**, with a captured update setting the target's suspension date. Test 1 in `remaining-auth.test.ts`; log records both responses. Both source files are unchanged from HEAD.

This is a confirmed alternate-path bypass of an existing explicit role rule, not a proposed new role policy. It lets a lower administrator disable a super administrator, including the only one; existing `last_super_admin` protection covers demotion, not this write. Launch blocking until suspension/unsuspension authority is consistently checked. Plan: centralize the existing privileged-target rule, reuse it in PATCH and dedicated actions, revoke sessions consistently, and add differential-role regression tests. No schema migration.

### AUTH-06 — API key escapes workspace/capabilities through support

Untouched guards: `app.ts:254` authenticates `/tickets/*` and resolves an optional workspace; there is no interactive-session, method-scope or ticket capability guard. `routes/tickets.ts:150` filters the collection only by `userId`. Detail at `:187` and authorization at `:202` likewise omit workspace restrictions. `lib/business-profile.ts:62` explicitly states that API/MCP keys are permanently bound to their creating workspace.

Scratch request: `GET /tickets`, valid synthetic API key with scopes `["mcp","actors:read"]`, bound to `workspace-a`, owning user `owner` → **200**. Captured query is exactly `{userId:"owner"}`, and a fixture ticket belonging to `workspace-b` is included. Test 2 in the scratch fixture runs the full app authentication and workspace guards. This is same-user, cross-workspace access through a deliberately delegated credential, not a claim that an unauthenticated user can read another user's tickets. Detail/message paths have the same account-level condition by inspection; only collection read was dynamically reproduced.

Launch blocking because a narrowly delegated workspace key obtains private support data outside its workspace and selected capabilities. Browser support may intentionally be account-wide; preserve that behavior. Plan a key-specific boundary: safest initial policy is interactive-session-only support, or explicitly design scoped support capabilities. Coordinate with support API ownership before changing its handlers. No migration for interactive-only enforcement; new capability policy needs contract/documentation review.

### AUTH-07 — forwarded IP is trusted before a trusted proxy boundary

Untouched `routes/web-auth.ts:60` takes the first comma-separated `x-forwarded-for` element for a 30-request/15-minute rate bucket. `.deploy/nginx-web.conf:15` uses `$proxy_add_x_forwarded_for`, preserving caller-supplied leftmost values; the web API proxy forwards non-hop-by-hop headers (`apps/web/src/lib/api-proxy.ts:62`). The installed Next implementation at `node_modules/next/dist/server/base-server.js:565` only populates `x-forwarded-for` when absent (`??=`), so it does not remove the supplied chain. No verified deployment-specific sanitization superseding this template was available.

Scratch test 3: 31 sequential `POST /auth/local/forgot-password` requests, JSON unknown fixture email, `X-Forwarded-For: 203.0.113.10, 127.0.0.1` → 30×200 then 429. One further request with `203.0.113.11, 127.0.0.1` → **200**. Database user lookup is mocked to null: no email, account mutation or password hashing occurs. This proves bucket identity spoofing, not a load-related outcome. Account-level failure/code limits remain separate mitigations.

Recommended launch blocker for the supplied reverse-proxy topology: public authentication's IP throttle is caller-selected. Plan a centralized trusted client-IP resolver and explicit ingress overwrites, with a bounded local fixture for forwarded chains, absent headers and IPv4/IPv6 normalization. Coordinate proxy changes with deployment/API owners; this phase changes no security settings or proxy files.

### AUTH-08 — TOTP replay across distinct challenges

Untouched behavior within current `lib/server-session.ts:109`–`:116`, `:155`–`:170`: the code is checked, the individual challenge claimed, then a session created. `packages/shared/src/totp.ts:65` accepts previous/current/next time-step values. No last-accepted counter is stored in `packages/db/prisma/schema.prisma`'s User model.

Scratch test 4 calls the real session-completion function twice with distinct valid challenges and the same generated TOTP: statuses **[200,200]**, two session insertions. The recovery-code candidate does not affect this TOTP branch. This fixture assumes each request has already passed password or verified social identity; an OTP alone is insufficient. No automatic launch block is assigned without a product decision, but duplicate acceptance is confirmed. Plan a per-user/per-secret last-accepted step and atomic monotonic claim covering accepted clock drift; migration required.

### AUTH-09 — impersonation survives authority revocation

Untouched `middleware/auth.ts:167` loads the impersonated target only. Checks at `:189`, `:211` validate target suspension and time expiry, while `:227` treats a non-null `impersonatedById` as sufficient. Dedicated administrator suspension at `routes/admin.ts:646` deletes rows by `userId`, leaving derived impersonation rows whose `userId` is the target and `impersonatedById` is the administrator.

Scratch test 5 supplies an unexpired target session attributed to a revoked administrator. `requireAuth` returns **200**, sets `authMethod:"impersonation"`, and never looks up the originating administrator. The fixture establishes the missing authority check; a full suspended-operator lifecycle against a real database was not run. The code path from dedicated suspension to surviving derived row is reachable by inspection. Recovery of the original administrator session separately does check current authority and is sound.

Impact is continuing access to already impersonated USER accounts until the existing 15-minute lease ends, not issuance of new leases after suspension. Mark as a revocation-policy decision, not an automatic launch block. Plan administrator role/suspension validation for derived sessions and consistent revocation by both `userId` and `impersonatedById` where policy requires it. No migration needed for those checks; source-session-specific revocation would require storing a parent session reference.

## Verified sound, with limits

- Passwords: `packages/db/src/password-auth.ts:33` uses per-password random salt, fixed scrypt parameters and timing-safe hash comparison. Login uses a valid dummy hash for an unknown user and refuses unverified email. Existing password, login and reset tests passed. No password provider was called.
- Email codes: purpose/user-bound HMAC, ten-minute expiry, five attempt limit and conditional single-use claim at `password-auth.ts:126`–`:147`. Password reset upserts only the authenticated-code user's credential and revokes all their database sessions. These are existing verified controls, not new findings.
- Social sign-in: `lib/firebase-admin.ts:39` pins RS256, expected audience and issuer; nonempty bounded subject and non-future auth time checked. `firebase-session.ts` requires Google/GitHub and verified email; `firebase-social.ts` extracts a provider identity; local two-factor completion is still required. Tests mock Google's key fetch; real Firebase revocation behavior, OAuth browser state/nonce and provider setup are untested.
- Installed dependency source inspected: `node_modules/jose/dist/webapi/lib/jwt_claims_set.js:64` verifies configured issuer/audience and present expiration; required `exp`/`iat` are not separately configured here, so no claim that missing claims are rejected. No signed Google token missing those claims was produced and no exploit is asserted.
- Cookie issuance: configured HTTPS selects `__Secure-authjs.session-token`, HttpOnly, Secure, SameSite=Lax, host-only path `/`; `lib/auth-session-cookie.ts:19`–`:54` and passing session-flow tests. Production environment validation requires an HTTPS AUTH_URL. Auth endpoints force private/no-store and reject foreign origins/cross-site Fetch Metadata.
- CSRF scope checked against **installed Hono**, `node_modules/hono/dist/middleware/csrf/index.js:96`: its default check covers form-compatible content types and accepts allowed origin or same-origin Fetch Metadata. It is not a universal JSON-origin guard. Existing full-app form-CSRF and auth JSON-origin tests pass; complete browser cookie/SameSite behavior is not claimed.
- API key authentication hashes a fixed-format credential, checks revocation/expiry/suspension and owner-workspace consistency. Workspace selection cannot widen a key through a header or cookie (`lib/business-profile.ts:62`). Existing auth/business-profile/actor-scope tests pass. Ticket escape AUTH-06 is the explicit exception.
- Administrative guard rejects absent/invalid sessions, suspended/non-admin users and impersonation sessions. Empty or unset service secret cannot match: `middleware/admin.ts:7` returns false for missing expected value before its fixed-size digest comparison. Hierarchy enforcement has the alternate-route exception AUTH-05.
- Impersonation creation rejects service-key callers, nested/admin targets and suspended/deleting targets; consume is bound to the authenticated administrator and conditionally single use (`routes/admin.ts:2085` onward). Original-session recovery checks current administrator role/suspension/expiry. Expired target impersonation is denied by the API. Authority revocation of an already issued lease is AUTH-09.
- Public session DTO uses an explicit safe field selection, and session listings omit session tokens. API-key lists/exports omit hashes and raw keys. Account export explicitly selects safe key fields. No new secret exposure was confirmed in these auth responses.
- NextAuth-named catch-all is a proxy to API-owned routes, not a second stock credential provider (`apps/web/src/app/api/auth/[...nextauth]/route.ts:1`). Bootstrap promotion is an explicit local seed script, not a public first-user registration rule.

## Suspected and policy-dependent items

These are not counted as confirmed vulnerabilities or launch blockers:

- Mixed-cookie identity ambiguity: `middleware/auth.ts:31` prefers the non-secure-name cookie, whereas `lib/web-session.ts:9` and `middleware/admin.ts:34` prefer the secure-name cookie. Two simultaneously valid cookies can represent different users. A usable cookie-tossing attack depends on deployment/subdomain access not verified here. Plan one shared selection rule with explicit legacy migration; do not silently change compatibility in this phase.
- No active-session count cap or idle timeout is apparent at `lib/server-session.ts:168`; sessions expire after 30 days. Account-level password failure throttling exists. Session-cap policy is unspecified; no resource-exhaustion experiment was performed.
- `requireInteractiveSession` rejects API keys but accepts impersonation. That permits some credential/security actions during mimic mode. Product intent is unspecified; do not change it silently. Extension pairing itself requires `authMethod === "session"` and rejects impersonation.
- Private fields nested deeper than configured logger paths may not be redacted; the shared logger comment promises `req.headers` safety but its paths use top-level `headers`. Auth request logging itself records method/path/status rather than credentials. This is an observability/secret-handling seam for the general security owner; no reachable production credential logging call was confirmed here.

## Audit-phase coverage and verification record

All checks used local mocks, build outputs or a disposable loopback database. Three pre-existing integration tests remained skipped. No existing gate was relaxed.

| Check | Exact command or equivalent | Result |
| --- | --- | --- |
| Initial configured runner | `pnpm --filter @actorconsole/api test` | Failed before tests: pnpm runtime/home setup, log retained |
| Initial direct API runner | `node ../../node_modules/vitest/vitest.mjs run` before workspace builds | 57 suites failed resolving absent workspace dist entries; 7 passed, 30 tests passed; setup failure, not a valid clean baseline gate |
| Local preparation | Prisma `generate`; TypeScript emit for shared/logo/db/apify/ai | Passed after generating missing Prisma client; no database connection during generation |
| Focused regressions on baseline | Four files, two invocations above | 9 failed / 52 passed, proving missing cases |
| Focused regressions after preserved edits | Four-file command above | 61 passed |
| API suite | From `apps/api`: `node ../../node_modules/vitest/vitest.mjs run` | 64 files passed, 1 skipped; 711 tests passed, 3 skipped |
| Whole repository tests | From root: `node node_modules/vitest/vitest.mjs run` | 232 files passed, 1 skipped; 1,850 tests passed, 3 skipped |
| Source type checking | `node node_modules/typescript/bin/tsc --noEmit -p <project>` for ten source projects | 10 passed, 0 failed |
| Configured package lint | Existing `eslint . --max-warnings=0` in each package that defines lint | 11 passed, 0 failed |
| Extra root-wide lint | `node node_modules/eslint/bin/eslint.js . --max-warnings=0` | 23 errors in unchanged scripts/web file; this broader invocation is not the configured per-package gate; no fixes made |
| TypeScript emit | `tsc -p` across nine non-web source projects | 9 passed; does not substitute for MCP/extension bundle scripts |
| MCP/extension bundle scripts | `node apps/mcp/scripts/build.mjs`; `node apps/chrome-extension/scripts/build.mjs` with loopback public origins | Both passed; generated dist only |
| Web boundary | `node scripts/check-web-boundary.mjs` | Passed |
| Frontend production compilation | `next build` in disposable `web-build` copy, local API URL, telemetry/Sentry disabled, external sockets/fetch blocked | Passed from copied app directory; earlier run from wrong cwd failed Tailwind discovery and was corrected. Repository frontend source was not modified |
| Remaining auth observations | Scratch five-test command above | 5 reproductions passed, undesirable behaviors remain |
| Real database recovery race | `node --import ./node_modules/tsx/dist/loader.mjs /workspace/scratch/auth-audit/recovery-db.mts`, synthetic loopback DATABASE_URL | Baseline sequence: 2 successful claims; candidate: 1; preserved other code |
| Whitespace validation | `git diff --check` | Passed |
| Coverage threshold checks | Direct Vitest invocation in the seven packages listed by `scripts/test-coverage.mjs`, `run --coverage --coverage.thresholds.lines=60 --coverage.thresholds.statements=60` | 7 passed with unchanged include lists and thresholds; API 90.38%, shared 94.07%, AI 88.19%, Apify 83.33%, DB 100%, worker 98.59%, web 99.36% lines/statements. Exact pnpm wrapper not used |
| Gitleaks | `pnpm secrets:check` | Not run; Gitleaks unavailable. No secret-scan clearance claimed |
| Full root build / production container / migrations / browser E2E | Configured multi-project scripts | Not all run as one gate; see limits below |

Detailed logs are under `/workspace/scratch/auth-audit/evidence/`. `auth-env-inventory.json` records 23 environment-read sites in the selected auth files (names only; no environment values). Installed versions checked from their actual manifests: Hono 4.13.13, jose 6.2.12, Prisma client 6.19.3, Next 15.5.28, Firebase 12.19.0, Vitest 2.1.9, TypeScript 5.9.3.

## Audit-phase scope boundaries, readiness and remaining blockers

The local MariaDB schema was created with `db push` solely for the recovery CAS check. This is **not** evidence that every migration applies to an empty database, that a production image boots, or that backup/restore works. No existing database was connected. Docker integration fixture was removed. Source type checks, isolated frontend compilation, MCP/extension bundle scripts and the configured coverage thresholds passed individually; full configured root `pnpm build`, Gitleaks and production-image startup are not all verified as one release gate. The selected coverage include lists omit several auth libraries/routes, so their aggregate percentages are not a claim of complete authentication coverage.

Registry SCA, outdated-package analysis, install-script/license inventory, Docker supply chain, payments, upload/SSRF/injection reviews, production operations and whole-product launch readiness belong to other audit scopes and are **not verified here**. This report supplies installed auth dependency evidence only; it makes no zero-CVE claim. Real email delivery, real Firebase flows/revocation, browser Playwright golden paths and full two-user/role DAST against a running stack remain pending local or human verification. There is no accessible launch checklist to mark complete.

At the end of the audit phase, AUTH-06 required support/API coordination, AUTH-07 required API/proxy coordination, AUTH-05 remained a plan, and further implementation was blocked by the then-active planning-only restriction. That restriction and these implementation statuses were subsequently superseded by the current handoff addendum. The UI form-dispatch finding remains separately owned. No action was denied by automatic approval review and no external mutation was uncertain.

### Cross-owner reconciliation (not added to this report's finding count)

The actor-domain owner reports an Actor-A-restricted credential listing/applying an Actor-B logo recommendation in the same workspace, recorded in `docs/audit/2026-10-actor-domain-audit.md` in owner chat `01a176c4-c0bf-70cc-b0c4-739779dd30e4`. That report is not present in this isolated checkout; the source was independently reviewed here. Reachable endpoints are `GET /actors/logo-recommendations` (`routes/actor-logo-recommendations.ts:12`, workspace/user-only predicate `:19`) and `POST /actors/logo-recommendations/:id/apply` (`:78`, predicate `:84`, provider mutation `:106`). Dismiss at `:59` has the same actor predicate. App-wide capability checks are present (`app.ts:204`–`:208`), but these handlers do not apply `apiKeyActorIds` or `assertApiKeyActorScope`. Thus this is a separate **actor-restriction enforcement gap**, not AUTH-04's legacy method-scope interpretation or AUTH-06's account-wide support boundary. Keep the actor owner's reproduction/severity as canonical; no duplicate fix or independent count was created here.

The API owner separately reports contact throttling trusting rotated `CF-Connecting-IP`. AUTH-07 is specifically the authentication route's leftmost `X-Forwarded-For` bucket and supplied proxy chain, with its own bounded reproduction. Reconcile both under a shared trusted-IP remediation phase while retaining their exact affected routes/headers. Do not count a third generic rate-limit finding.

## Original nine-file pre-steer inventory

Source files:

1. `apps/api/src/lib/server-session.ts`
2. `apps/api/src/lib/two-factor-recovery.ts` (new)
3. `apps/api/src/routes/account.ts` (two-factor sections only)
4. `apps/api/src/routes/notifications.ts` (authorization middleware only)
5. `apps/api/src/routes/web-auth/signout.ts`

Regression files:

6. `apps/api/test/lib/server-session.test.ts` (new)
7. `apps/api/test/routes/account.test.ts`
8. `apps/api/test/routes/notifications.test.ts`
9. `apps/api/test/routes/web-auth/session-flow.test.ts`

Patch and SHA-256 inventory: `/workspace/scratch/auth-audit/preserved-app-edits.patch` and `preserved-app-edits.json`. Documentation added by this planning phase: this report and `docs/plans/authentication-remediation.md`. During the planning-only phase, no implementation edits were reset, discarded or extended. Subsequent authorized fixes and the isolated policy proposals are recorded in the current handoff addendum and remediation document.
