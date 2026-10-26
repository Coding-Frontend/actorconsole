# API data-handling remediation plan

Base: `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`; report: `docs/audit/2026-10-api-data-handling.md`.

Implementation authorized by the user's subsequent request to fix, commit and push. Phases 1–5 below are implemented on `fixes/actorconsole-20261026-api` from the base above; the architecture chat remains sole integrator. The eleven pre-cutover files were preserved and completed. The original test-first plan is retained below as review context, not a pending planning-only restriction. No database migration, production configuration, CI/CD, commercial/access/retention policy or credentials were changed.

Verification: full suite 1,893 passed / 3 skipped; all 11 workspace typechecks and 11 package linters passed; script tests 6 passed; checksum-verified Gitleaks all-available-history scan passed. All package production builds passed in a credential-free snapshot; post-commit/remote-ref receipts accompany the final handoff. Actual pnpm/Turbo orchestration remains unverified because the provided wrapper previously attempted an implicit install outside its usable store; equivalent declared package commands were executed directly without weakening checks.

Resolved plan items include gzip/deflate/Brotli decoded-byte bounds, DNS deadline/cancellation, proxy-before-allocation bounds, dedicated API route-label tests, socket-derived contact quotas and public diagnostic redaction. The trusted-IP contract is in `docs/CLIENT_IP_TRUST.md`. No actual trusted proxy list was activated; verify the installation's ingress peers before relying on separate client buckets behind proxies. Real network/TLS interoperability, broad DAST, SCA and operational rehearsals remain for their owners. The shared metric serializer is unchanged and remains owned by architecture. The auth dependency is standalone commit `b1f5db62b3e5b4f754380a564bed1f5eb94a7430`, exporting `resolveClientIp(c: Context): string` from `apps/api/src/lib/client-ip.ts`; its pushed remote ref was verified before the rest of the handoff.

## Phase 1 — pin logo destinations (DH-01, launch blocking)

- Files: `packages/logo-catalog/src/index.ts`; retained new `src/safe-fetch.ts`; `src/index.test.ts`; retained new `src/safe-fetch.test.ts`. Coordinate worker reachability at `apps/worker/src/lib/website-catalog.ts` without rewriting classification.
- Test first: a DNS answer containing hex-mapped loopback must be rejected before any transport call. A public answer followed by a changed answer must never change the actual socket target. Test mixed A/AAAA records, IPv6 literals, credential-bearing URLs, same-host/private redirects and retries. Preserve known-valid public IPv6 and supported image behavior.
- Implementation: use checked addresses in the connection lookup/dispatcher, keep the original hostname for Host/SNI/certificate verification, and prohibit private/special-use destinations in canonical forms. Validate each redirect/retry. Do not disable TLS verification or use a blanket allow-list exception for tests.
- Review retained prototype before reuse: native HTTPS/identity encoding changes fetch behavior. Decide and test decompression, certificate verification, timeouts through body completion, socket cancellation, address-family fallback, retry cleanup and any supported proxy behavior. Prefer the smallest transport change that preserves intended behavior.
- Migration: no. Configuration: no new credential or production security setting. Docs: document the verified downloader contract in the audit/README, including transport and resource limits.
- Verify: logo package tests/typecheck/lint, worker website-catalog tests, API admin-website-logos tests, and a disposable loopback transport harness if TLS behavior cannot be proven by unit fixtures. No private/external target access.

## Phase 2 — bound bytes at every parser boundary (DH-02, launch blocking)

- API files: retained `apps/api/src/middleware/request-body-limit.ts`, `src/app.ts`, `src/routes/webhooks.ts`; affected webhook/upload tests. Shared downloader files as in phase 1.
- Cross-scope files for coordination, not overlapping edits: `apps/web/src/lib/api-proxy.ts`; billing webhook route consumers in `apps/api/src/routes/billing.ts` and `razorpay.ts`; nginx body-limit examples owned by infrastructure.
- Test first: a finite chunked stream without Content-Length must stop at limit + one chunk, return 413 before integration lookup/parser/provider work and invoke cancellation. Repeat with a misleading Content-Length in a local Request fixture. Preserve exact binary/HMAC bytes and valid multipart uploads at the supported cap. For upstream page/image bodies, assert incremental limits and cancellation, not only final buffer length.
- Implementation: enforce per-boundary byte limits while reading, before JSON/multipart/text allocation; distinguish total multipart overhead from allowed image bytes. Add matching protection or bounded streaming at the Next.js proxy before its `arrayBuffer()` call. Avoid relying solely on an ingress declaration or a post-read size check. Clean up rejected redirects/statuses and bound decompressed bytes if decompression is supported.
- Product decision: confirm maximum legitimate JSON/bulk payloads and multipart overhead. The implemented 6 MiB API/proxy cap accommodates the existing 5 MiB image plus overhead. No larger supported payload contract was found; review any installation-specific bulk payload requirements before integration.
- Migration: no. Docs: README/API size contracts and any nginx-template mismatch, with infrastructure owner review.
- Verify: body-limit/webhook/upload/logo regressions, impacted API/worker suites, proxy tests from its owner, all package typechecks/lints/builds. No load test and no live provider calls.

## Phase 3 — bound HTTP metric cardinality (DH-03, launch blocking)

- Files: `apps/api/src/app.ts`; add a dedicated app observability regression under `apps/api/test/`. Review `packages/shared/src/metrics.ts` with the observability owner only if broader cardinality safeguards are needed.
- Test first: four unique unauthenticated 404 paths must share one unmatched series. Several IDs under one dynamic registered route must share one pattern. Check early middleware responses, errors, HEAD/OPTIONS and arbitrary custom methods. No path or request ID may become an unbounded label value.
- Implementation: use registered route patterns and an explicit unmatched value; normalize custom methods into one bounded label. Preserve useful method/status counters and avoid recording raw personal identifiers as labels.
- Implemented: registered-route/method logic in `app.ts` now has dedicated unknown-path, asset-ID and custom-method regressions in `test/app-data-boundaries.test.ts`.
- Migration/configuration: no. Docs: metric label contract and dashboard query migration note if consumers depend on raw paths. Coordinate label changes before rollout.
- Verify: bounded local app fixtures, metrics unit tests, full API tests/typecheck/lint. No resource-exhaustion test.

## Phase 4 — establish one trusted client-address contract (DH-04, launch blocking when public contact enabled)

- Files in API ownership: `apps/api/src/routes/contact.ts`, its tests, and a small shared address resolver if agreed. Seam files: nginx examples and web API proxy. Auth-related forwarded-IP readers belong to the authentication owner; do not edit them in parallel.
- Test first: retain a fixed trusted peer/proxy identity while rotating CF-Connecting-IP/X-Forwarded-For; the eleventh contact request must be 429 for a ten-request cap, with email delivery mocked. Use distinct email fixture values to keep the independent email quota from hiding requester-key bypass. Also test missing headers and IPv4/IPv6 canonicalization under the agreed contract.
- Implementation decision before code: identify the actual network peer source and trusted proxies. Do not pick a different arbitrary header as a generic fix. Trusted ingress must overwrite the authoritative field and clear spoofable alternatives, or the adapter must supply verified peer metadata. Direct API access and the Next proxy must have defined behavior.
- Preserve production Redis fail-closed behavior and existing per-email quotas. Do not relax gates or add a permissive fallback when identity is unavailable.
- Migration: no. Deployment/security configuration changes require separately authorized infrastructure work; this plan does not perform them. Docs: deployment and request-address trust contract with auth/infra owners.
- Verify: bounded functional fixture only (limit plus at most five), contact tests and proxy trust tests, production Redis failure behavior in disposable mocks/services. No mail provider calls.

## Phase 5 — privacy and webhook field hardening (DH-05/06/07)

This can be split into two independent sessions if different owners need to work concurrently.

### 5a. Public readiness diagnostics

- Files: `apps/api/src/routes/health.ts`, `apps/api/test/routes/health.test.ts`.
- Test first: inject a fabricated filesystem/SQL diagnostic into DB and Redis failure paths; `/health/ready` must retain 503/status/latency while excluding diagnostic contents. Keep healthy/skipped behavior and deterministic timeout assertions. Update existing expectations that explicitly permit raw messages.
- Implementation: stable public dependency failure codes; private safe diagnostics linked by an internal request/reference ID if needed. Do not log credentials or move sensitive detail into a different public field.
- Migration/config: no. Docs: runbook instructions for private diagnosis. Verify health and general error middleware tests/typecheck/lint.

### 5b. Resend verification and signed input schemas

- Files: `packages/shared/src/webhook-verify.ts` and tests; `apps/api/src/routes/webhooks.ts` and tests.
- Test first: 44 non-ASCII signature characters return false without throwing; unsupported signature versions reject; a valid candidate among multiple rotated signatures still succeeds; tampered/stale/missing/wrong-secret fixtures continue rejecting. A signed object-valued email_id or mixed-type recipients must return 400 with no database writes. Exercise valid string/array recipient forms and unknown event types.
- Implementation: version/encoding validation and byte-safe constant-time comparison; whole-event schema validation before any mutation. Preserve exact raw signed bytes and reject oversized bodies before signing/integration work. Keep existing behavior for unknown events unless an explicit event policy is agreed.
- Migration/config: no for these fixes. Replay persistence or event-order changes would be a separate product/data-integrity decision and might need a migration; do not add them speculatively.
- Docs: webhook payload/response contract and provider retry implications. Verify shared webhook tests, Resend route tests, and the full impacted API/shared suites without real provider calls.

## Final integration session

1. Recheck baseline and worktree ownership. Reconcile DH IDs with the unavailable historical audit and other chat findings. Keep authentication/key-scope and UI 2FA Enter-key findings separate from this API scope.
2. Review preserved diff and new-file fingerprints from `/workspace/scratch/actorconsole-data-handling-audit/`. Implementation is now authorized; integrate the reviewed scoped commits without resetting another chat's work.
3. Run declared package typechecks, lint, full tests, script tests and builds. Record skips explicitly. Gitleaks was initially absent and is now checksum-verified in /tmp; the all-available-history scan passes. The existing pnpm wrapper failed before tests, so verify actual pnpm/Turbo orchestration separately when repaired.
4. Ask the parent to integrate SCA, full-stack role/two-user DAST, disposable production image/migration rehearsal and ops evidence. These checks were not completed by this scoped owner.
5. Update each finding with exact resulting SHA, commands and evidence. Do not label a finding fixed from a source change alone, or count a missing gate as passed. Only the scoped handoff branch push is authorized here; main integration/publishing belongs to architecture. No deployment, credentials, production data or security-setting changes are authorized.
