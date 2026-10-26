# API validation and data-handling audit — 2026-10-26

> Integration review: verified owner HEAD `1832d1e036fcc267713a907e74ef743ee786f8da` is imported. The coordinator additionally verifies the real shared signature helper through both API body guards: exact chunked UTF-8 bytes succeed and tampering fails before persistence. Owner-only counts below remain independent; see [the integration record](2026-10-integration.md) for exact accepted SHAs and combined checks. No actual ingress trust, DB contention or live-provider pass is implied.

## Implementation handoff — 2026-10-26

The subsequent user authorization explicitly permits implementation, commits and a normal push of the scoped handoff branch. The planning-only restriction in the historical audit below has been superseded. Work is on `fixes/actorconsole-20261026-api`, based on `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`; `main`, CI/CD, deployment and real installation settings are unchanged. The architecture chat is the sole integrator. The source changes below complete the eleven preserved prototype files and add the remaining confirmed fixes; the older prototype fingerprints identify the historical snapshot, not the final worktree.

| Finding | Handoff status and regression evidence |
| --- | --- |
| DH-01 | Implemented: native HTTPS connects only to validated/pinned public DNS results, keeps the original Host/TLS hostname, rejects private IPv6 variants, validates each retry/redirect and includes DNS in the deadline. `packages/logo-catalog/src/safe-fetch.test.ts` exercises rebinding, mixed DNS records, redirects, preserved certificate-verification defaults and DNS abort. No live private-service request was made. |
| DH-02 | Implemented at API, Next.js API bridge and remote logo/page reads: incremental byte counting, cancellation, exact signed bytes, 6 MiB general request cap and 1 MiB Resend cap. Remote decoding supports gzip/deflate/Brotli and applies limits after decompression. Tests cover headerless/misleading-length streams, rejected compressed output, exact binary bytes and early rejection before forwarding/integration lookup. Files: API `test/middleware/request-body-limit.test.ts`, `test/app-data-boundaries.test.ts`, web `src/lib/api-proxy.test.ts`, logo tests. |
| DH-03 | Implemented in API route metrics only: registered patterns, one unmatched bucket, bounded method labels. `apps/api/test/app-data-boundaries.test.ts` verifies four unique 404s share one label, different IDs share their registered asset pattern, and custom methods map to OTHER. The shared serializer remains owned by architecture and is unchanged. |
| DH-04 | Implemented: contact quotas use verified Node socket metadata; only exact explicitly trusted proxy peer IPs can supply an X-Forwarded-For chain, walked right-to-left. CF-Connecting-IP/X-Real-IP never independently establish identity. Seven resolver cases plus two eleven-request bounded fixtures verify spoofing cannot evade the existing ten-request quota. `docs/CLIENT_IP_TRUST.md` gives the contract for auth/infrastructure owners. |
| DH-05 | Implemented: readiness errors expose only db_unavailable/redis_unavailable. DB/Redis diagnostic canaries are absent from response JSON; timeout remains a deterministic 503. `apps/api/test/routes/health.test.ts`. |
| DH-06 | Implemented: supported version and canonical signature structure/encoding are required; byte lengths are checked before constant-time comparison. Unicode/extra-field/unsupported-version rejection and key rotation pass in `packages/shared/src/webhook-verify.test.ts`. |
| DH-07 | Implemented: signed event fields are schema-validated before any database mutation. Object-valued IDs and mixed recipient types return 400 with no writes; unsigned events reject; valid bounce processing remains. `apps/api/test/routes/webhooks.test.ts`. |

The multipart upload also rejects files above 5 MiB with 413 before normalization/database writes. Its new regression first reproduced 500, then passed with the early file-size check; an accepted upload regression remains green (`upload-before.log`, `upload-after.log`).

Code commits (all based on the recorded baseline, in dependency order):

- `b1f5db62b3e5b4f754380a564bed1f5eb94a7430`: shared API `resolveClientIp(c: Context): string` dependency and contact quota enforcement. This standalone dependency was pushed and its remote ref verified before the remaining commits, so auth can consume the exact resolver without creating another helper.
- `b30c45932bc4523eea52efebb467f274b42d8b64`: logo destination pinning and decoded response bounds.
- `a7d59165a7aeee251519d58293fe9d22953b39f6`: API/proxy parser bounds, multipart file check and route metric labels.
- `c0a92f85e7f42fe4052e8e626008cd24e3262960`: signed webhook schema/signature validation and public readiness privacy.

Current verification: **1,893 passed / 3 skipped** in the full Vitest suite (236 files passed / 1 skipped); all **11 typechecks and 11 package lint checks** pass; script tests **6 passed**. Exact commands and logs are retained under `/workspace/scratch/actorconsole-api-implementation/` (copied from `/tmp/actorconsole-api-checks/`). Gitleaks 8.30.1 was installed only in /tmp from the same checksum-verified release used by the repository workflow; the all-available-history scan passed (15 existing commits, no leaks). All package production builds passed in a credential-free snapshot, including Next production build and the web boundary check; final API recompilation also passed after the upload fix. Final post-commit scan and branch-ref results are recorded with the handoff receipt. No gates were weakened.

Operational qualification: TRUSTED_PROXY_IPS defaults to empty and no live value was set. Until the integrator verifies the actual ingress peers, clients behind one proxy share its conservative requester bucket. This is not a claim that per-client ingress trust is configured. The existing nginx API 2 MiB versus 5 MiB upload mismatch remains documented for the infrastructure owner; no nginx/deployment configuration was changed. Auth forwarding-header call sites are not changed here. Existing proxy cache/identity/header behavior is preserved apart from byte-limit enforcement. No migration, access/commercial/retention-policy change, credential creation, paid/provider call, production request, deployment, force push or main push is part of this work.

GitHub accepted the dependency branch push and reported 91 existing default-branch dependency advisories (14 critical, 22 high, 50 moderate, 5 low). That server notice was relayed for SCA coordination; this owner did not independently validate reachability or treat the API fixes as resolving those advisories.

Real TLS interoperability/private-service exploitation, all role/two-user DAST, Docker deployment rehearsal, SCA and unrelated architecture findings remain outside the local regression evidence. Those are not counted as passing checks. The sections below retain the baseline audit and its original reproduction evidence; their launch-blocker counts describe that baseline, not an assertion that the handoff fixes are absent.

## Scope, baseline and instruction change (historical audit)

- Repository: `https://github.com/Coding-Frontend/actorconsole.git` (verified with `git remote -v`). Workspace: `/workspace/actorconsole`.
- Initial branch: `work`. Initial and final HEAD: `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`. Initial working tree was clean. Only `refs/heads/work` was present; there was no local `main` or remote tracking ref. This report does **not** claim that the revision was verified against the current remote `main`.
- Runtime actually inspected: Node `24.19.0`, bundled Undici `7.29.0`, installed Hono `4.13.13`, Zod `4.6.7`. No website domain was inferred from the repository name.
- Ownership: API input validation, injection, SSRF, files, data exposure, inbound webhook verification, abuse limits and server trust boundaries. Authentication ownership, billing policy, UI behavior, CI/CD, infrastructure changes and production operations are excluded.
- The original instruction authorized fixes. Eleven application/test files were changed before the later **planning-only** instruction arrived. Application edits stopped immediately; those changes remain uncommitted and are inventoried below. No branch, commit, push, merge or deployment was created.
- Subsequent work consisted of reads, local tests, a clean baseline archive, scratch evidence and these audit/planning documents. No production requests, live payments, paid provider calls, credential creation, security-setting changes, load testing or production data changes were performed.

Read: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `APIFY.md`, `docs/CREDENTIALS.md`, `docs/RUNBOOK.md`, `docs/AI-PROVIDERS.md`, deployment instructions, nginx examples and relevant package/test configuration. No project `AGENTS.md`, `CLAUDE.md`, `.agents/skills`, named known-issues document, progress document or launch checklist was found. A dependency's unrelated AGENTS file was not applied. `docs/CREDENTIALS.md` references an unavailable historical private audit; its findings cannot be deduplicated here. Reconcile these IDs against that audit before merging reports.

All source locations in the findings refer to the **base SHA**, even where the retained local prototype has since changed line numbers.

## Executive assessment

Seven confirmed findings; four recommended launch blockers for the supplied public deployment shape. These are recommendations tied to evidence, not a claim that a production instance was exercised. No critical-severity finding is claimed.

Top five: (1) logo DNS/private-address enforcement is bypassable, (2) size limits are applied after buffering untrusted streams, (3) unauthenticated paths create persistent metric series, (4) a caller-controlled forwarding header bypasses the contact requester limit, (5) public readiness responses disclose raw dependency diagnostics.

The original baseline gates pass under equivalent direct package commands. Their passing does not cover the newly reproduced security cases. The retained prototype passes its impacted tests but is **not an integrated or approved fix**. Contact IP trust and readiness disclosure remain unchanged. The web proxy still buffers request bodies before the API's new local limit.

| ID | Finding | Severity | Status | Recommended launch block | Ownership seam |
| --- | --- | --- | --- | --- | --- |
| DH-01 | Logo DNS validation is disconnected from the connection; alternate IPv6 private forms pass | High | CONFIRMED | Yes: untrusted catalog metadata reaches an outbound network boundary intended to reject private destinations | Worker/catalog reachability; API owns common downloader |
| DH-02 | Request and remote-response byte limits run after buffering | Medium | CONFIRMED | Yes: advertised byte bounds do not bound application allocation, particularly remote logo/page streams | Web proxy and billing webhook consumers need coordinated boundary coverage |
| DH-03 | Arbitrary unauthenticated paths create unbounded persistent metric series | Medium | CONFIRMED | Yes: each new path adds retained process state without requiring authentication | Observability owner must review label policy |
| DH-04 | Forged CF-Connecting-IP bypasses contact requester throttling | Medium | CONFIRMED | Yes when public contact delivery is enabled behind the supplied nginx configuration; a separately verified edge that overwrites this header could mitigate it | Infrastructure/client-IP resolution; auth owner has separate forwarded-IP callers |
| DH-05 | Public readiness response returns raw dependency error messages | Low | CONFIRMED | No: diagnostic disclosure demonstrated, actual credential disclosure not demonstrated | Operations may need detailed private diagnostics |
| DH-06 | Malformed Resend signatures throw; signature version is ignored | Low | CONFIRMED | No: malformed input causes 500 rather than rejection; unsupported-version acceptance still requires the correct MAC | Shared webhook helper |
| DH-07 | Signed webhook JSON can supply Prisma filter objects and invalid recipient types | Low | CONFIRMED | No: malformed fields require a valid provider signature; this is not an unauthenticated database injection claim | Resend email-log/newsletter integrity |

## Evidence and reproducibility

Preserved evidence directory: `/workspace/scratch/actorconsole-data-handling-audit/`. Clean baseline source archive: `/tmp/actorconsole-data-handling-baseline/`. That archive contains no real environment files. Its original production source remains at the base revision; audit-only test files were added after its full gate. The installed dependency tree is reused read-only; workspace package links resolve to the archived packages.

`baseline-gate-results.json` records exact commands, exit status and durations. `baseline-package-lint-results.json` records every actual package lint result. Reproduction tests use Hono `app.request()`, fabricated byte streams, mocked DNS/transports and mocked mail/database dependencies. They do not open a network connection to a target. The contact fixture makes exactly eleven local function requests for a ten-request limit, with no emails sent. No exhaustion or load test was attempted.

### DH-01 — destination validation does not control the socket

Reachability: `apps/worker/src/lib/website-catalog.ts:232` extracts an arbitrary domain from Actor metadata; line 240 creates its identity; line 568 calls `discoverOfficialLogo`. Alternatively, the admin-guarded `POST /admin/website-logos/:id/import` at `apps/api/src/routes/admin-website-logos.ts:210` calls the same downloader at line 214. This is not limited to a fixed vendor hostname.

Base implementation: `packages/logo-catalog/src/index.ts:119` only recognizes dotted IPv4-mapped IPv6, not `::ffff:7f00:1` or expanded hex equivalents. `assertSafeLogoUrl` resolves at line 160, discards those addresses, and the downloader then invokes fetch with the original hostname at lines 169–170 and 100. Every redirect is checked, but a new connection is not bound to the checked answer.

The actual runtime's bundled Undici connector calls `tls.connect({ ..., host: hostname })` at extracted source lines 3301–3313, with no pinned lookup supplied by this caller. The exact installed source excerpt is preserved as `node-bundled-undici-connector.txt`; it was extracted from `process.binding('natives')['internal/deps/undici/undici']`, not inferred from package behavior remembered elsewhere.

Reproduction: run from the baseline archive:

```sh
node node_modules/vitest/vitest.mjs run packages/logo-catalog/src/ssrf-boundary-audit.test.ts --maxWorkers=1 --minWorkers=1
```

Result: **2 failed / 2**. The assertion requiring rejection instead receives a successful fabricated image response for (a) DNS returning `::ffff:7f00:1`, and (b) a simulated second connector lookup changing from a public IP to `127.0.0.1`. See `baseline-ssrf-reproductions.log` and the preserved test source `ssrf-boundary-audit.test.ts`. The separate regression suite also fails seven alternate/private IPv6 assertions.

Impact: a private-destination allow-list can be bypassed by untrusted URL/DNS data. Actual access to an internal HTTPS service remains dependent on routing, service behavior and valid TLS verification; no plaintext cloud-metadata read or real private-service access was attempted or claimed. Plan: validate the actual connection destination, retain TLS/Host verification, handle IPv4-embedded IPv6 consistently and revalidate redirects/retries. See remediation phase 1.

### DH-02 — size checks occur after allocation

Reachable sites at the base SHA:

- `packages/logo-catalog/src/index.ts:182`: reads the entire image with `arrayBuffer()` before the actual 5 MiB check at line 183. A missing or false Content-Length bypasses the earlier declaration check.
- Same file, line 389: `(await response.text()).slice(0, 1_000_000)` downloads the entire remote page before truncation. Manifests share this path.
- Public `POST /webhooks/resend`, `apps/api/src/routes/webhooks.ts:27`: reads the entire request before the 1 MiB check in `parseWebhookJson` at line 11. The global app has no general request-body limit at the baseline. The 64 KiB intelligence route middleware is local to that route group.
- `apps/api/src/routes/admin-website-logos.ts:243` parses multipart data before normalization can enforce the image cap. This route is admin-guarded.
- Cross-scope seam: `apps/web/src/lib/api-proxy.ts:61` buffers the entire incoming body before forwarding, so a backend-only fix cannot protect that earlier allocation. `billing.ts:279,318` and `razorpay.ts:284` also read raw bodies; coordinate byte limits without changing billing policy.

Installed Hono implementation was opened at `node_modules/hono/dist/middleware/body-limit/index.js`: it short-circuits on Content-Length and its streaming rejection does not explicitly cancel its reader. Do not claim cancellation merely because that middleware is present. The body is rebuilt from buffered chunks for the headerless case.

Reproduction command, from the baseline archive after adding the preserved regression fixtures:

```sh
node node_modules/vitest/vitest.mjs run packages/logo-catalog/src/index.test.ts packages/shared/src/webhook-verify.test.ts apps/api/test/routes/webhooks.test.ts --maxWorkers=2 --minWorkers=1
```

Result: **15 failed / 26 passed**, including this finding and DH-01/06/07. `baseline-regression-reproductions.log` records: an oversized logo stream is consumed without invoking cancellation; an oversized official page is truncated and processing continues; a request exceeding 1 MiB reaches integration lookup and returns 503 for the fixture's missing configuration instead of early 413. All streams are finite local fixtures.

The nginx examples independently cap API bodies at 2 MiB (`.deploy/nginx-http.conf:8`) and frontend bodies at 10 MiB (`.deploy/nginx-web.conf:9`). They reduce request exposure when deployed as written; they do not limit the remote-response paths or constitute a per-parser application bound. No deployed proxy configuration was verified. Plan: count bytes during reads, cancel rejected streams, preserve exact signed bytes, and apply limits at both proxy and API boundaries. See phase 2.

### DH-03 — request paths become persistent metric keys

Reachability: all API requests pass through `apps/api/src/app.ts:77`. At line 85, only long alphanumeric segments are redacted. Short arbitrary paths remain unique. `packages/shared/src/metrics.ts:6` and line 7 define permanent Maps; line 28 inserts each unique label set, and histograms retain further bucket objects.

Reproduction command, from the baseline archive:

```sh
node node_modules/vitest/vitest.mjs run apps/api/test/data-handling-audit.test.ts --maxWorkers=1 --minWorkers=1
```

Result: **3 failed / 3**, covering DH-03/04/05. Four unauthenticated requests, `GET /audit-a` through `/audit-d`, each return 404. The assertion that these share one bounded counter label fails: **expected length 1, received 4**. See `baseline-boundary-reproductions.log` and `data-handling-audit.test.ts:17`.

Impact: caller-generated path diversity becomes retained process memory and telemetry-cardinality growth. Resource exhaustion was not attempted. Plan: label using registered route patterns plus one unmatched bucket; normalize arbitrary HTTP methods and keep identifying path data out of labels. See phase 3.

### DH-04 — untrusted forwarding header wins over the proxy's address

Reachability: public `POST /contact`, `apps/api/src/routes/contact.ts:27`. Lines 29–31 prefer `cf-connecting-ip` over `x-real-ip` and X-Forwarded-For. The nginx API and web examples overwrite X-Real-IP but do not clear or overwrite CF-Connecting-IP (`.deploy/nginx-http.conf:12` and `.deploy/nginx-web.conf:13`). The Next.js proxy copies this header at `apps/web/src/lib/api-proxy.ts:47`.

Reproduction: same boundary command above, test at `data-handling-audit.test.ts:32`. The actual local fallback rate limiter is used with Redis mocked absent; mail is stubbed. Eleven contact requests retain `x-real-ip: 198.51.100.10`, rotate only the CF header and email (to avoid conflating the independent per-email quota), and all return **202**. **Expected a 429, received eleven 202 responses**. This is a bounded functional fixture, not a load test.

Impact: the documented ten-per-requester bound does not hold for this supplied proxy path; public contact delivery can be abused while varying addresses and email fields. Production rate-limiter storage is a separate concern: the production Redis failure path does fail closed. Plan: derive requester identity from a verified ingress/peer contract and reject arbitrary client precedence. Coordinate central address resolution with the authentication and infrastructure owners; do not duplicate their route fixes. See phase 4.

### DH-05 — raw readiness diagnostics are public

Reachability: app publicly mounts `/health`; `apps/api/src/routes/health.ts:76` handles `/ready`. Its helper catches dependency failures and returns `err.message` at line 52 directly in the response, bypassing the general error-response redaction.

Reproduction: same boundary command, test at `data-handling-audit.test.ts:26`. `GET /health/ready` with a fabricated database failure returns **503** and includes:

```json
{"status":"fail","error":"AUDIT_DIAGNOSTIC_CANARY at /private/database-client.ts:12 SQL SELECT"}
```

The assertion that the public response excludes the canary fails. No real connection string or credential was used. Existing `apps/api/test/routes/health.test.ts` explicitly expects raw failure messages, demonstrating that the passing gate does not enforce diagnostic privacy. Plan: return stable public failure codes and retain safe private operational diagnostics. No launch block claimed solely from this demonstration. See phase 5.

### DH-06 — signature parser throws on byte length and ignores version

Base source: `packages/shared/src/webhook-verify.ts:28` ignores the prefix. Lines 29–30 compare JavaScript character counts before calling `timingSafeEqual` on UTF-8 buffers. A 44-character non-ASCII candidate can have 88 bytes and throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` rather than returning false. It is reachable through the public Resend route when its signing secret is configured, without knowing that secret.

Reproduction: the regression command above, tests `rejects non-ASCII signatures without throwing` and `rejects unsupported signature versions`. Baseline results: **RangeError** for `v1,` followed by 44 fabricated `é` characters, and **true instead of false** when a valid test MAC is labelled `v2`. Logs: `baseline-regression-reproductions.log`.

The version case does not bypass the MAC or timestamp requirement; it is a protocol-validation flaw. Plan: accept the supported version, validate encoding, compare byte lengths and reject malformed candidates without throwing. Preserve multiple-signature key rotation. See phase 5.

### DH-07 — verified signatures do not validate field types

Base source: `apps/api/src/routes/webhooks.ts:46` casts JSON rather than validating it. `body.data.email_id` reaches `db.emailLog.updateMany({ where: { providerId } })` at line 69, and recipient values reach `.toLowerCase()` after earlier writes at line 81.

Reproduction: same regression command, three signed-field tests with signature verification stubbed successful. Their bodies and baseline outcomes are:

| Fabricated signed body | Baseline outcome | Intended assertion |
| --- | --- | --- |
| `{"type":{"includes":"bounced"}}` | 500 | 400, no writes |
| `{"type":"email.bounced","data":{"email_id":"email_1","to":["builder@example.com",{}]}}` | 500 after earlier mocked writes | 400, no writes |
| `{"type":"email.delivered","data":{"email_id":{"not":null}}}` | 200, object forwarded as the providerId filter | 400, no writes |

These are mocked database observations, not production updates or a real Prisma mutation. The source permits a Prisma-shaped filter object to cross this boundary. An attacker still needs a valid provider signature, so this is explicitly not a claim of an unauthenticated injection exploit. Plan: validate the whole event before any database mutation, bound identifiers/recipients and preserve unknown event handling where policy is unclear. See phase 5.

## Verified sound within the checked coverage

- Logo storage traversal: exact `website-logos/<identity>/<sha256>.webp` key validation and root containment; existing traversal/storage tests pass. No archive extraction handler was found in the owned upload path. Filesystem attacker-created symlinks were not exercised.
- Logo normalization: actual sharp decoding, input pixel cap, fixed WebP output, immutable checksum keys, executable/external SVG fixture rejection, malformed-image rejection and oversized-buffer rejection all pass existing tests. This does not certify every SVG/polyglot/native-decoder case.
- Existing redirect-to-literal-private-IP blocking passes. DH-01 concerns address forms and the lookup/connection seam, not absence of any redirect check.
- Run storage access: `apps/api/src/routes/actors.ts:970` checks workspace Actor ownership, then `run.actId` before reading logs/storage. Existing actors route tests pass; no new cross-tenant storage bypass was found in this reviewed path.
- Research SQL uses `Prisma.sql` tagged values and closed sort choices (`apps/api/src/lib/actor-research.ts:68`); no `$queryRawUnsafe`/`$executeRawUnsafe` or request-driven shell execution was found in the owned tree.
- Contact schema is strict with field bounds and escapes text/HTML before email construction. Its existing malformed-input and delivery-error tests pass. DH-04 is separate from those checks.
- Resend helper rejects stale timestamps, modified bodies, missing signatures and wrong test secrets in existing tests. The route checks configured secret and signature before database writes. DH-06/07 describe additional gaps only.
- Production rate limiter fails closed when Redis is absent/failing; the Redis script checks/adds atomically. The in-memory fallback is development/test behavior. Production distributed-limit behavior was not exercised against Redis.
- Public catalog dispatch uses own-property operation lookup and operation-specific schemas; the API proxy constructs its target from a configured server origin, encodes path segments and does not follow redirects automatically.
- General production unknown-error responses are generic; existing error-middleware tests pass. DH-05 identifies a responder outside that mechanism.
- Markdown rendering uses raw parsing followed by sanitization, and the existing executable-markup test passes. This is a UI-owner seam observation, not a duplicate frontend finding or a complete XSS assessment.

## Outbound request inventory and exclusions

| Boundary | Source | Who controls destination | Assessment |
| --- | --- | --- | --- |
| Logo discovery/imports | logo-catalog index, worker website-catalog, API admin-website-logos | Untrusted discovered domain/page metadata or admin source URL | DH-01/02 |
| Public Store documentation | API `lib/public-actor-content.ts:26,44` | Fixed `https://apify.com` origin plus encoded Actor path; upstream may redirect | No arbitrary initial host found; response volume/redirect trust not independently hardened or exhaustively tested |
| Apify REST/Console | `packages/apify/src/client.ts:1373,1434,1741` | Server configuration and fixed Console origins | No request-controlled base URL found in reviewed API call sites; authentication flows belong to auth owner |
| Dynamic AI providers/proxy | `packages/ai/src/lib/text-router.ts:61,188` | Admin-selected endpoint/proxy, explicitly supported by `docs/AI-PROVIDERS.md` | Intentional trusted configuration; private endpoints not banned without product policy; no paid calls made |
| Admin provider diagnostics | API `routes/admin.ts:1568,1577` | Fixed OpenAI/Google URLs | Admin-guarded; no live diagnostics invoked |
| MCP health/API bridge | API `routes/mcp.ts:197`; MCP `lib/actorconsole-api.ts:41,92` | Server environment base plus tool-defined paths | No untrusted full destination identified in reviewed paths; no broad SSRF-clean guarantee |
| Frontend API bridge | web `lib/api-proxy.ts:37,58` | Configured backend base, encoded route segments | Target construction reviewed; buffering/header trust seams remain DH-02/04 |

No general user-configurable outbound webhook delivery subsystem was identified in the owned API. Payment signature/idempotency/event-order policy belongs to the billing owner. Auth recovery-code/session/key-scope findings belong to the authentication owner. The UI Enter-key 2FA dispatch issue is separate; this report neither duplicates nor implements those findings.

## Gate and test record

`pnpm exec` initially failed before running tests because the provided pnpm wrapper attempted an implicit install and could not create `/home/agent/.local/share/pnpm`. No escalation or denied action was retried. Existing local tool binaries were then invoked directly. Initial missing generated Prisma types were resolved with local `prisma generate`; this generated SDK files only and did not connect to a database.

Clean baseline full gate, before audit fixtures were added to its test tree:

| Check | Exact invocation shape | Result |
| --- | --- | --- |
| TypeScript, 11 workspaces | `node <root>/node_modules/typescript/bin/tsc --noEmit -p <workspace>/tsconfig.json`; config workspace uses its declared explicit flags | 11 passed |
| Lint, actual 11 package scripts | from each workspace: `node <root>/node_modules/eslint/bin/eslint.js . --max-warnings=0` | 11 passed |
| Full Vitest | `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --minWorkers=1` | 231 files passed, 1 skipped; 1,832 tests passed, 3 skipped; exit 0 |
| Script tests | `node --test scripts/*.test.mjs` (glob expanded explicitly by runner) | 6 passed, 0 failed |
| Builds | declared shared/db/apify/ai/logo/API/worker TypeScript builds; MCP and extension build scripts; web boundary check and Next production build; ESM import fix script | All executed package builds passed |
| Extra root-wide ESLint diagnostic | `node node_modules/eslint/bin/eslint.js . --max-warnings=0` from repo root | 23 existing errors, mostly root scripts and one web rule under the root configuration; this is broader than `pnpm lint`, whose package scripts all pass. Not labelled a passing gate or fixed here |
| Gitleaks | `pnpm secrets:check` equivalent | Not run: gitleaks executable absent |

Builds ran in the credential-free archive with telemetry disabled, no Sentry upload token, and web backend URL `http://127.0.0.1:1`. This is equivalent package-command verification; the pnpm/Turbo orchestration itself was not successfully exercised.

New security assertions against unchanged baseline production source: 15 failing/26 passing in the regression suite, 3 failing boundary assertions, 2 failing mocked SSRF assertions. These intentional failures are separately labelled and are not mixed with the original gate result.

Retained local prototype: the focused five-file suite passes **52/52**. The impacted API/shared/logo/worker suites pass **984**, with **3 skipped**, across 95 passed/1 skipped files. Three affected package typechecks and three affected package lint commands pass. See `preserved-edits-tests.log` and `preserved-edits-lint-results.json`. Full production-image/runtime integration of the prototype was not run or claimed.

## Preserved pre-planning edits (historical snapshot)

These eleven files were preserved at the planning-only cutover. That historical snapshot is identified by `preserved-code-sha256.json`, `preserved-tracked-changes.patch` and `preserved-new-files/` in the baseline evidence directory. The later authorized implementation completes these files; these old fingerprints are not final-commit fingerprints.

| File | State | Prototype intent |
| --- | --- | --- |
| `apps/api/src/app.ts` | Modified | Registered-route metric labels, bounded method labels, 6 MiB request limit |
| `apps/api/src/routes/webhooks.ts` | Modified | 1 MiB early request limit and signed-field schema |
| `apps/api/src/middleware/request-body-limit.ts` | New | Count bytes/cancel before parsers; preserve signed bytes |
| `apps/api/test/routes/webhooks.test.ts` | Modified | Malformed-field, unsigned-event, streamed-limit regressions |
| `apps/api/test/middleware/request-body-limit.test.ts` | New | Chunk counting, lying length header, cancellation, exact bytes |
| `packages/logo-catalog/src/index.ts` | Modified | Pinned transport and incremental response limits |
| `packages/logo-catalog/src/index.test.ts` | Modified | IPv6 variants and streamed-response regressions |
| `packages/logo-catalog/src/safe-fetch.ts` | New | Destination classification, pinned native HTTPS lookup, bounded reads |
| `packages/logo-catalog/src/safe-fetch.test.ts` | New | DNS rebinding/redirect socket-boundary fixtures |
| `packages/shared/src/webhook-verify.ts` | Modified | Version/encoding/byte-length validation |
| `packages/shared/src/webhook-verify.test.ts` | Modified | Unicode, version and key-rotation regressions |

The historical prototype still needed decoded-response handling, dedicated route-pattern tests and proxy limits. The implementation handoff above adds those fixes and records their tests. Real TLS/network interoperability and installation-specific proxy trust still require the separate integration/operational verification described above.

## Suspected, untested and remaining blockers

- SUSPECTED residual resource risk: candidate/manifest counts and cumulative discovery time are not capped as a single job budget. The source iterates all candidates, but no crafted slow-site job was executed. No launch-block label assigned to this untested hypothesis.
- Untested: real network/TLS SSRF exploitation, symlink attacks by a local filesystem adversary, archives/zip bombs, exhaustive polyglots, signed event ordering/replay semantics, distributed Redis failure timing, and all role/account matrices outside the owned data paths.
- SCA (`npm audit`, outdated, license/install-script inventories), Docker production image, empty-database migration rehearsal, backup/restore, ops contacts, browser flows and full-stack two-user DAST are **not covered by this scoped report**. Parent audit must reconcile other owners' work; no missing gate is counted passed.
- No launch checklist or known-issues file was available to score or deduplicate. Historical credential revocation is a separate user/provider verification item from `docs/CREDENTIALS.md`; no credential operations were attempted.
- Integration/publishing beyond the handoff branch belongs to the architecture coordinator. The planning-only restriction was superseded by the later explicit implementation/publication instruction. No automatic approval denial occurred. The initial pnpm store failure was a local tooling error, not an access operation whose uncertain outcome needs retry.

No residual risk is accepted on the user's behalf. Findings and mitigation decisions remain for the parent review and implementation phase.
