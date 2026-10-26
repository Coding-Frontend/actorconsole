# ActorConsole UI/UX audit — 2026-10-26

> Integration note: the 22 application/test files and this report pair are imported. Raw logs, JSON and browser scratch harnesses remain on the [verified UI handoff branch](https://github.com/Coding-Frontend/actorconsole/tree/5469cd0f7506672e0e38105e08411079623ed676/audit/ui-ux); references to `audit/ui-ux/*` below refer to that retained evidence, not missing integration files. Owner-only test results remain distinct from combined results in [the integration record](2026-10-integration.md).

## Current implementation handoff — supersedes historical status below

The user's later instruction authorized implementation, commits and normal push of the UI handoff branch. All **12 confirmed UI findings are now fixed and locally verified**. The two preserved pricing/SEO route-test failures are repaired without removing their destination/current-route assertions: the tests now exercise a mobile breakpoint and query the mobile navigation's dialog role. Server authentication and API contracts, commercial/access/retention policy, CI/CD and production settings were not changed.

Base remains `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`. Handoff branch: `fixes/actorconsole-20261026-ui`. Reviewable application commits:

- `4d595cb45c2dc124a36ffa6934f9d51311f0e623` — accessible navigation, palette and docs keyboard behavior.
- `5fb7fe358f336b16bee1fd55367dec7d8effae28` — form submission/drafts, notification response ordering, contrast and newsletter affordances.

The architecture chat is the integration/publishing coordinator. This branch is a review handoff; no push to main, merge, deployment, production request/data operation, paid provider call or security-setting change is included. Final normal-push outcome and remote SHA are reported in chat after verification; this document records the validated code commits.

| Finding | Current result | Regression evidence |
| --- | --- | --- |
| UI-01/UI-02 | Fixed: shared modal drawer contains focus, supports Escape/backdrop/focus return, and closes at the desktop breakpoint | `navigation-drawer.test.tsx`; browser forward/reverse Tab, Escape, backdrop and repeated resize at 320/375/767/1023px |
| UI-03/UI-04 | Fixed: the displayed 2FA step owns submission; rejected verification is handled with retained retry input | `email-password-form.test.tsx`; actual built `/login` captures both `totpCode` and `challengeToken` on Enter and has no unhandled fetch rejection |
| UI-05 | Fixed: successful earlier sends preserve newer contact/reply drafts | `contact-form.test.tsx`, `ticket-reply-box.test.tsx`; deferred-response browser assertions and real built contact page |
| UI-06 | Fixed with the existing primary button pairing, without altering global signal colors | Real components in both themes; alpha-composited normal/hover/focus contrast minimum **12.75:1**, above 4.5:1; axe fixture has no violations |
| UI-07 | Fixed: “Subscribing…” remains an accessible name, with success/error announcements | `newsletter-subscribe.test.tsx`; pending button accessibility snapshot |
| UI-08 | Fixed: close failure rejects to ConfirmDialog, which keeps error and retry in context | `ticket-reply-box.test.tsx`; local 503 fixture keeps one dialog open |
| UI-09 | Fixed: palette title/active selection/item scrolling and opener-focus restoration | `command-palette.test.tsx`, browser row visibility and Escape focus return; a newly reproduced duplicate Escape callback (2 calls before) is now tested as exactly 1 |
| UI-11 | Fixed: opening docs search focuses it; Escape returns to its trigger | `docs-shell.test.tsx` plus actual built docs page |
| UI-13 | Fixed: obsolete loads are aborted/ignored; old previews/counts clear when the workspace changes | `notification-center.test.tsx` covers A→B→A and stale success/failure; exactly two browser requests leave NEW visible after OLD completes |
| UI-14 | Fixed: privacy-policy affordance links to `/legal/privacy` | `newsletter-subscribe.test.tsx` verifies the real link target |
| UI-10 | Not promoted to a confirmed issue; speculative pre-planning shortcut changes were removed | No reachable editable dashboard integration established; base shortcut policy retained |
| UI-12 | Rejected, not “fixed” | Actual built docs still fit 320/375/768/1024/1440px; no width/layout change made |

Final frontend gate results: **120 test files / 594 tests pass, zero failures**; TypeScript `--noEmit --incremental false` passes; ESLint `--max-warnings=0` passes; Next production build passes (58 static pages); web-boundary check passes. The 14 confirmed component-browser assertions pass; suspect UI-10 and rejected UI-12 are explicitly excluded from that fixture's fixed-issue count, rather than relabelled as passes. Three actual built public pages returned HTTP 200, with correct keyboard 2FA, retained contact draft and no browser page errors. These are frontend/local results, not full monorepo or server-security certification.

Commands, issue matrix, 22 exact application/test paths and code commits are in [implementation-handoff.json](https://github.com/Coding-Frontend/actorconsole/tree/5469cd0f7506672e0e38105e08411079623ed676/audit/ui-ux/implementation-handoff.json). Raw final logs/JSON are `audit/ui-ux/evidence/implementation-*`; failing assertions before implementation are retained in `implementation-regressions-before.txt` and `palette-double-dismiss-before.txt`. New executable checks are `audit/ui-ux/navigation-regression.mjs` and `audit/ui-ux/next-implementation.mjs`. Built-app POSTs were intercepted locally, not sent to any backend or provider.

Gate corrections were transparent: the first new typecheck found an unsupported query option (corrected); the first new lint found an unnecessary cleanup counter warning (corrected); a concurrent typecheck initially raced Next's regeneration of `.next/types` and was rerun successfully after the build completed. The extended browser fixture also scoped its error assertion to the form to distinguish Next's route announcer and waited for Radix's deferred outside-pointer listener before the backdrop gesture. No assertion, repository gate or security control was disabled.

**Remaining verification limits:** root Vite **5.4.21** is Vitest's transitive version; the integration checkout resolves `apps/web/node_modules/vite` to **8.3.5**. This is not a demonstrated direct-manifest mismatch. A fresh frozen install/Node22 CI parity remains unverified. Full monorepo/coverage gates and Gitleaks were not run here (Gitleaks is absent); actual authenticated backend flows, provider delivery, Safari/touch keyboards and real screen readers remain integration work. No confirmed UI implementation blocker remains in this local scope. Root launch policy and non-UI findings still belong to their owners.

## Historical baseline audit and planning-only record

The remainder records the earlier audited baseline and preserved WIP exactly in their historical context. Its “pending” and “planning-only” statements describe that phase, not the later authorized implementation above. The original patch and hashes remain available for provenance.

## Scope, authority and repository

This is the UI owner's scoped report for integration with the parent audit. The later **planning-only** instruction superseded the earlier fix request. Application edits stopped when that instruction arrived; earlier edits remain intact and are separately preserved as a patch. No branches or commits were created. No push, merge, deployment, CI/CD change, security-setting change, production-data operation, credential creation, paid API call or load test was performed.

- Repository: `https://github.com/Coding-Frontend/actorconsole.git`, checkout `/workspace/actorconsole`.
- Actual branch: `work`; initially clean.
- Exact base: `fc52f547286b14de2f483899b4aa5dcdfca8b5ea` — “Update dependencies with Zod 4, Vite 8 and Sentry 11 compatibility fixes (#37)”. `git ls-remote origin refs/heads/main` returned that same SHA. There was no local `main` ref; the branch was not renamed or switched.
- Repository's first commit: `4a70b099734e11abc1895fcbaa4a06240869fabe` — “Initial open-source release”.
- Targets were resolved from the repository. No website domain was assumed or contacted. Browser targets were loopback ports 4188, 4190 and 4191; the API origin used for builds was an unused loopback port, 4199.
- Ownership: presentation components/styles, keyboard navigation, forms and UI states. Server authentication, authorization, recovery codes, session management, billing, CI/CD, data retention and infrastructure belong to other audit owners.

Read: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/RUNBOOK.md`, `deployment.instructions.md`, `.env.web.example`, frontend source/tests and CI gate definitions. No `AGENTS.md`, `CLAUDE.md`, local `.agents/skills`, progress document, known-issues document or launch checklist was found in the configured checkout; workspace `.agents` and `.codex` directories were empty. The catalog's verification and React review skills were read. No prior UI issue register was available for deduplication; the parent should reconcile these IDs with other owners.

## Executive result

**12 confirmed baseline UI findings: 8 medium, 4 low. One additional concern is suspected; one responsive hypothesis was rejected. No server security vulnerability is claimed by this report.**

The untouched baseline passes the frontend type, lint, test and production-build checks in the installed environment. Therefore there is **no demonstrated baseline failure of those release gates**. The preserved WIP has **one demonstrated integration blocker: its unit-test gate fails two tests**. Do not count WIP improvements as delivered fixes.

No documented UI launch-acceptance policy was found. Launch-blocking status for baseline UI findings is **pending product-owner decision**, rather than an asserted security release block. Resolve UI-01, UI-02, UI-03 and UI-05 before UI acceptance: they respectively allow focus to escape an advertised modal, leave desktop scrolling locked, misdispatch keyboard 2FA submissions, and erase unsent user text. UI-13 also needs workspace-owner review because it displays a stale workspace inbox.

Top priorities:

1. UI-03: authenticator Enter sends only email/password, omitting the entered code and challenge.
2. UI-05: successful contact/reply submission erases text written while the request was pending.
3. UI-01/UI-02: mobile navigation loses keyboard containment and can leave desktop scrolling disabled.
4. UI-13: an earlier workspace's notification response overwrites the current inbox.
5. UI-06/UI-09: inadequate text contrast and command-palette accessibility/scrolling defects.

## Evidence and test boundaries

All source line references below refer to **base SHA**, unless explicitly marked WIP. Inspect moved lines with `git show fc52f547286b14de2f483899b4aa5dcdfca8b5ea:<path> | nl -ba`. This prevents preserved local edits from changing the meaning of a citation.

The browser fixture renders actual frontend components with local navigation stubs and synthetic API responses. External browser traffic is blocked. It does not establish server authorization or database behavior. A separate built baseline Next.js app verified public pages with their real root layout and fonts. Its backend origin was loopback 4199, with no live services or credentials. Browser checks used installed Playwright and system Chromium, plus installed axe-core; Playwright MCP was not available.

Commands and reproducibility: [audit harness README](https://github.com/Coding-Frontend/actorconsole/tree/5469cd0f7506672e0e38105e08411079623ed676/audit/ui-ux/README.md). Raw results, including failures and the rejected fixture hypothesis: [evidence directory](https://github.com/Coding-Frontend/actorconsole/tree/5469cd0f7506672e0e38105e08411079623ed676/audit/ui-ux/evidence/). The ordinary browser checks intentionally exit 1 when a correct-behavior assertion fails; they are audit scratch checks, not changes to a repository gate.

| Check | Untouched base | Preserved WIP | Evidence |
| --- | --- | --- | --- |
| Frontend TypeScript, `tsc --noEmit --incremental false` | Pass, exit 0 | Pass, exit 0 | `baseline-typecheck.txt`, `wip-typecheck.txt` |
| Frontend ESLint, `. --max-warnings=0` | Pass, exit 0 | Pass, exit 0 | `baseline-lint.txt`, `wip-lint.txt` |
| Frontend Vitest, full suite | **114 files / 572 tests pass** | **113 files pass, 1 fails; 570 tests pass, 2 fail** | `baseline-tests.txt`, `wip-tests.txt` |
| Frontend Next.js production build | Pass; 58 static pages generated | Pass; 58 static pages generated | `baseline-build.txt`, `wip-build.txt` |
| `node scripts/check-web-boundary.mjs` | Not separately rerun in scratch snapshot | Pass: no DB client, Auth.js, backend SDK or backend secrets | Recorded terminal output; rule file unchanged |
| Targeted component-browser assertions | 0 pass / 16 fail | 7 pass / 9 fail | `baseline-browser.json`, `wip-browser.json`; includes one rejected responsive hypothesis and duplicate contrast corroboration |
| Notification response-order fixture | Fail: old result overwrites new after exactly 2 requests | Not separately run; component unchanged | `notification-race.json` |
| Real built Next public pages | `/docs/first-workspace`, `/login`, `/contact`: HTTP 200 | Not rerun as full app | `next-baseline-pages.json`, `next-baseline-contact.json` |
| Real Next docs search bounds | Fit at 320, 375, 768, 1024, 1440 CSS px | Not run | `next-baseline-pages.json` |

The WIP failures are both in `apps/web/src/app/(dashboard)/dashboard/tools/tools.test.tsx:125`: the tests look up a second `complementary` landmark, while the new mobile drawer renders a `dialog`. Failure: `Expected container to be an Element, a Document or a DocumentFragment but got undefined` at line 126, for pricing and SEO routes. This is a WIP compatibility failure, not a new finding about untouched `main`. It remains unresolved because application/test edits are now prohibited.

The first `pnpm --filter @actorconsole/web test` attempt did not execute tests: installed pnpm 11.25 attempted package-manager setup under `/home/agent/.local/share/pnpm` and failed with ENOENT. Direct installed binaries were then used. No frozen-lockfile reinstall or CI parity is claimed. Node was 24.19.0; the repository pins pnpm 9.15.0. Installed packages inspected from disk: Next 15.5.28, React/React DOM 19.3.1, Radix Dialog/FocusScope 1.3.1, react-remove-scroll 2.7.2, Vitest 2.1.9, Vite 5.4.21, Playwright 1.64.1, axe-core 4.14.0. Integration correction: root Vite 5.4.21 is Vitest's transitive dependency and web Vite resolves to 8.3.5. No direct-manifest mismatch is established; fresh-install/CI parity remains unverified.

## Findings register

All baseline launch-blocking decisions are pending owner policy; the priority column identifies the proposed remediation sequence. There is no accepted residual-risk decision on the user's behalf.

| ID | Title | Severity | Status | Priority / coordination |
| --- | --- | --- | --- | --- |
| UI-01 | Mobile navigation lacks modal keyboard behavior | Medium | CONFIRMED | Before UI acceptance |
| UI-02 | Resize leaves marketing document scroll-locked | Medium | CONFIRMED | Before UI acceptance |
| UI-03 | Authenticator Enter dispatches password login | Medium | CONFIRMED | Before UI acceptance; UI ownership, auth seam |
| UI-04 | Interrupted authenticator verification rejects without handling | Medium | CONFIRMED | Auth UI follow-up |
| UI-05 | Pending sends erase newer unsent drafts | Medium | CONFIRMED | Before UI acceptance |
| UI-06 | Contact button text fails contrast in both themes | Medium | CONFIRMED | Accessibility acceptance |
| UI-07 | Newsletter pending button loses accessible name | Low | CONFIRMED | Accessibility follow-up |
| UI-08 | Failed ticket closure dismisses its confirmation | Low | CONFIRMED | Support UI follow-up |
| UI-09 | Command palette lacks dialog title and scrolls wrong nodes | Medium | CONFIRMED | Keyboard/accessibility follow-up |
| UI-10 | Global slash shortcut could interrupt editable content | Low | SUSPECTED in actual app | Defer until reachable editable integration is established |
| UI-11 | Docs search opens without moving focus | Low | CONFIRMED | Keyboard follow-up |
| UI-12 | Docs search control clipped at 320px | — | REJECTED hypothesis | Actual built app passed all widths |
| UI-13 | Old workspace notification result overwrites newer result | Medium | CONFIRMED | Coordinate workspace/data owner; UI response ordering |
| UI-14 | Newsletter privacy-policy affordance is not a link | Low | CONFIRMED from reachable source | Presentation follow-up |

### UI-01 — Mobile navigation keyboard behavior

Reachable sources: `apps/web/src/components/marketing/header.tsx:131` and `:165`, mounted by `apps/web/src/app/(marketing)/layout.tsx:11`; `apps/web/src/components/admin/sidebar.tsx:183`; `apps/web/src/components/dashboard/sidebar.tsx:408`, mounted by the dashboard shell. The marketing drawer declares `aria-modal=true` but does not contain focus or make the surrounding page inert. Admin/dashboard drawers use plain overlays and asides with no modal keyboard lifecycle.

Reproduction: `node audit/ui-ux/browser-audit.mjs`, assertions `UI-01` and `UI-01-admin`. At 375×812 the marketing drawer starts with focus outside (`initialFocusInside=false`), and Tab escapes it (`tabEscapes=true`). In Admin, Escape leaves one mobile aside open with no dialog role (`visibleMobileSidebars=1`, `dialogCount=0`). On the built Next baseline, the marketing failure also reproduces (`mobileInitialFocusInside=false`). Impact: keyboard users can traverse the background while a modal is visually open; Admin Escape does not dismiss it.

Existing marketing-header tests cover account labels and scroll styling, not modal focus. Existing sidebar tests check structure/navigation, not containment. Generic Radix dialog behavior is available: installed `node_modules/@radix-ui/react-dialog/dist/index.mjs:163` hides siblings, `:172` traps focus, and `:267` connects dismissal. Installed FocusScope at `node_modules/@radix-ui/react-focus-scope/dist/index.mjs:89` and `:122` implements initial focus and Tab looping. A plain `role=dialog` does not invoke that code. Plan: use one accessible drawer primitive and verify focus entry/return, Tab/Shift+Tab, Escape, backdrop, route changes and nested controls.

### UI-02 — Marketing resize scroll lock

Source: `apps/web/src/components/marketing/header.tsx:41`, especially `:48`; the drawer is hidden at `lg` at `:151`, without clearing `mobileOpen` on breakpoint changes.

Reproduction: open at 375px, resize to 1280px. The visible drawer disappears but computed body overflow remains `hidden`. Confirmed both in the component fixture (`UI-02`) and the built Next app after 400ms. Impact: a normal resize/rotation can strand a desktop page without scrolling. Plan: close the mobile state on crossing its desktop breakpoint and restore the prior scroll state through the drawer lifecycle; test repeated crossings and reopening.

### UI-03 — Authenticator Enter dispatch

Reachable source: `apps/web/src/components/auth/email-password-form.tsx:128` always binds the form to password `onSubmit`; the verification button is `type=button` at `:147` and invokes a separate handler at `:151`. Mounted at `apps/web/src/app/(auth)/login/page.tsx:76`.

Local request/response reproduction: fulfill the first `POST /api/auth/local/login` with `{ "ok": true, "requiresTwoFactor": true, "challengeToken": "disposable-challenge" }`, enter `123456`, then press Enter in Authenticator code. The second POST JSON has exactly the keys `["email","password"]`; both `totpCode` and `challengeToken` are missing. Assertion `UI-03` fails; the same request shape was captured on the built `/login` page, HTTP 200. The expected fields are supported by `apps/api/src/routes/web-auth.ts:22` and passed onward by `apps/api/src/routes/web-auth/login.ts:61`.

This is a UI submission bug, **not proof of 2FA bypass**. Clicking the explicit verification button follows a different path. The auth owner owns server recovery-code, session and challenge security. Plan: dispatch form submission according to the displayed step; make the verification action the appropriate submit action; test Enter and click with identical payloads, recovery-code text, blank codes and repeated pending submits. Do not change the server contract.

### UI-04 — Verification network failure

Source: `apps/web/src/components/auth/email-password-form.tsx:113` awaits `completeSession` inside `try/finally` without a catch. The click handler at `:151` discards that promise. In contrast the password submit path catches failures at `:106`.

Reproduction: same synthetic challenge; abort the next login request and click Verify and continue. `UI-04` captures an unhandled browser error `Failed to fetch`; the retry button re-enables but no failure is handled by this path. No server request is made by the aborted fixture. Plan: handle rejected verification requests visibly while preserving the code and challenge for retry, and test fetch failure plus malformed responses.

### UI-05 — Unsent draft loss

Contact source: `apps/web/src/components/marketing/contact-form.tsx:42` unconditionally clears the form after success, while fields at `:61`, `:77`, `:110` remain editable. Reachable `/contact` mounts it at `apps/web/src/app/(marketing)/contact/page.tsx:117`.

Reply source: `apps/web/src/components/dashboard/ticket-reply-box.tsx:36` clears `body` after success, while textarea `:67` remains editable. Reachable ticket detail mounts it at `apps/web/src/app/(dashboard)/dashboard/support/[id]/page.tsx:216`.

Reproduction: hold the original successful POST response, type a new draft while it is pending, then release `{ "ok": true }`. For `POST /api/contact`, the sent message is `Original message for local audit`, but the newly typed `New unsent draft added while waiting` becomes `""`. For `POST /api/tickets/disposable-ticket/messages`, the original body is `Original reply`, while `New reply written while waiting` becomes `""`. Assertions `UI-05-contact` and `UI-05-ticket` fail. The built `/contact` page independently reproduces editable-pending state and lost newer text; ordinary repeated Enter while pending produced **one** POST, so duplicate sends are not claimed.

Impact: real unsent content is discarded after an unrelated earlier request succeeds. Plan: prevent edits while sending, or clear only the exact draft/version that was submitted. Preserve retry behavior on failures; test both a newer pending draft and a successful unchanged draft.

### UI-06 — Contact contrast

Source: `apps/web/src/components/marketing/contact-form.tsx:125` combines adaptive orange background with white 14px text. Colors originate at `apps/web/src/app/globals.css:53` and `:113`.

Reproduction: `UI-06` resolves white-on-`rgb(248,102,6)` at **3.05:1** in light mode and white-on-`rgb(255,154,103)` at **2.09:1** in dark mode. Installed axe-core independently reports 3.04:1 against an expected 4.5:1 for the normal-sized text. The real built contact page confirms those foreground/background colors and 14px font size. Plan: use a verified accessible button pairing; preserve chart/brand signal colors rather than broadly changing a shared token. Recheck normal, hover, focus and disabled states in both themes.

### UI-07 — Newsletter pending action name

Source: `apps/web/src/components/marketing/newsletter-subscribe.tsx:74` replaces all Subscribe text with only a loader SVG while pending. Reachable through `newsletter-cta.tsx:44` and `apps/web/src/components/marketing/home-content.tsx:31`.

Reproduction: defer `POST /api/newsletter/subscribe` after entering a synthetic email. `UI-07` observes `buttonText=""`, `ariaLabel=null`, and the accessibility snapshot `- button [disabled]`. Plan: retain an accessible action name and expose pending/success state. Do not report the email input as having no accessible name: Chromium can derive one from its placeholder, and the axe check did not flag it.

### UI-08 — Failed close confirmation dismisses

Source: `apps/web/src/components/dashboard/ticket-reply-box.tsx:52` and `:58` set an error but resolve `close()` normally; `:94` passes that callback to ConfirmDialog. `apps/web/src/components/ui/action-dialog.tsx:51` closes after any resolved callback.

Reproduction: synthetic `POST /api/tickets/disposable-ticket/close` responds **503** with `{ "ok": false, "error": { "message": "Disposable service unavailable" } }`. After allowing closing animations to finish, `UI-08` sees `remainingDialogs=0` despite `errorVisible=true`. The action failed but its confirmation dismissed, making an in-context retry unavailable.

The generic dialog's existing rejection test is sound; the integration hole is that this caller swallows rejection. Plan: make the actual callback communicate failure to the dialog, keep error/retry in that context, and clear stale errors on a new attempt. Do not weaken the generic rejection test.

### UI-09 — Command palette

Source: `apps/web/src/components/dashboard/command-palette.tsx:168` renders no DialogTitle; `:149` indexes `listRef.children` by a flattened command index, although direct children are category wrappers at `:198`. Reachable via `apps/web/src/components/dashboard/dashboard-shell.tsx:54` and `:206`.

Reproduction: open, focus search, press ArrowDown 14 times. `UI-09-name` finds no dialog title. `UI-09-scroll` selects MCP access outside the results viewport: row top/bottom **-70/-22**, results viewport **211/531**, scrollTop **1037**. Enter still acts on that hidden selection. Installed Radix Dialog `dist/index.mjs:261` supplies `aria-labelledby` only when a Title is present; its registered Title implementation is at `:275`.

Plan: name the dialog, expose the active selection to assistive technology, and scroll the selected command node rather than a category. Test long lists, empty search, clearing search, restricted navigation and a short viewport.

### UI-10 — Suspected shortcut/editor conflict

Source: base `apps/web/src/components/dashboard/command-palette.tsx:278` excludes only INPUT/TEXTAREA from the global slash shortcut. An isolated contenteditable fixture demonstrates that typing slash opens the palette and suppresses the character. **A reachable editable dashboard integration was not established.** The only CodeMirror source found is `apps/web/src/components/marketing/schema-code-view.tsx:65`, which is read-only and explicitly `editable={false}`; installed CodeMirror `node_modules/@codemirror/view/dist/index.js:8345` confirms that this sets `contenteditable=false`. The fixture must not be promoted to an actual editor defect.

Status: SUSPECTED/conditional, nonblocking. Preserve policy until a real select/editor/IME reproduction is established. The pre-planning WIP already changed this hook; that change needs review and is not counted as a confirmed required fix.

### UI-11 — Docs search focus

Source: `apps/web/src/components/docs/docs-shell.tsx:32` opens search on Cmd/Ctrl+K; `:162` toggles it on click; input at `:180` has no focus handoff. Mounted by docs layout `apps/web/src/app/(marketing)/docs/layout.tsx:10`.

Reproduction: `UI-11` clicks Search docs, then checks whether the rendered searchbox is `document.activeElement`; result **false**. Plan: focus the input on opening, restore a visible trigger on Escape, and verify query preservation across client navigation. Existing docs tests cover persistent structure and route selection, not focus.

### UI-12 — Rejected responsive hypothesis

The standalone fixture suggested that Search docs extended to x=346.84 in a 320px viewport. The authoritative built baseline app, with the actual root layout/fonts, contradicted it: right edge **283px** at 320px; it also fit at 375/768/1024/1440px. `/docs/first-workspace` returned HTTP 200 and had no browser page errors. The raw fixture failure is retained for transparency but is **not a product finding**. No layout remediation is prescribed from it.

### UI-13 — Notification response ordering

Reachable source: `apps/web/src/components/dashboard/notification-center.tsx:45` starts a load without cancellation/generation checks; `:58` applies every result; `:74` launches another load after workspace changes. Rendered by `apps/web/src/components/dashboard/topbar.tsx:110`.

Command: `node audit/ui-ux/notification-race.mjs` (exit 1). Hold the first GET `/api/notifications?page=1&limit=6`, dispatch `actorconsole:workspace-changed`, then fulfill the second GET with a synthetic NEW-workspace notification. The NEW row is visible. Release the first response containing OLD-workspace data: the OLD row replaces NEW. Evidence: exactly **2** requests, `oldResponseOverwroteNew=true`, `newResponseStillVisible=false`.

Impact: workspace switching can display stale notification content and counts. This is confirmed UI response-ordering behavior; it is **not proof that the API returned unauthorized data**. Coordinate with the workspace/data owner for identity and access-revocation policy. Existing `notification-center.test.tsx:48` checks a single happy-path preview; the dashboard shell's stale-access tests protect a different component. Plan: cancel/ignore obsolete notification loads and clear old workspace previews on switching, with A→B and A→B→A tests.

### UI-14 — Privacy-policy affordance

Reachable source: `apps/web/src/components/marketing/newsletter-cta.tsx:48` renders an underlined `span` saying “privacy policy”, under the subscription action. `apps/web/src/components/marketing/home-content.tsx:31` mounts the CTA. It is not an anchor, button or keyboard target. `/legal/privacy` is an existing route.

Status: CONFIRMED from reachable source, not browser-tested as a full homepage. Impact: the apparent policy link does not navigate. Plan: use the existing privacy route and verify accessible name and keyboard activation. No policy text or consent semantics should be changed by this presentation fix.

## Verified sound and exclusions

- Baseline frontend typecheck, zero-warning lint, all 572 tests and production build passed. This is scoped frontend evidence, not a claim that every monorepo gate passed.
- Real built docs toolbar fits all five tested widths; UI-12 is excluded.
- Shared ConfirmDialog keeps a rejected action open and exposes its error; existing `apps/web/src/components/ui/action-dialog.test.tsx:8` passes. UI-08 is the swallowing caller, not a generic-dialog defect.
- Existing workspace-refresher tests establish single background-refresh invocation across repeated renders and cooldown/remount behavior (`workspace-data-refresher.test.tsx:31`, `:53`, `:63`). No duplicate-refresh finding is asserted.
- Built contact form's repeated Enter while sending generated only one mocked POST. A race-free/idempotent server is not inferred.
- Skeleton shared styles include reduced-motion support (`components/ui/skeleton.tsx:24`); global `globals.css:1714` disables animation and smooth scrolling for reduced-motion preference. This was source-reviewed, not tested with an assistive device.
- Empty-state shared component tests, loading/skeleton tests, cookie-consent tests and dashboard access-state tests passed. No new issue is claimed in those tested contracts.
- Missing Log in in the marketing header is explicitly expected by `test/components/marketing-header.test.tsx:15`; do not change that product decision as an audit fix. `e2e/marketing-smoke.spec.ts:8` still expects a sign-in link, while its CI job is conditional at `.github/workflows/ci.yml:152`. Reconcile that seam with the test/product owner rather than reporting a missing link as a new UI defect.

## Preserved application WIP

These are **all seven application/test files touched before planning-only arrived**. No application file was edited afterward:

1. `apps/web/src/components/admin/sidebar.tsx`
2. `apps/web/src/components/dashboard/command-palette.tsx`
3. `apps/web/src/components/dashboard/sidebar.test.tsx`
4. `apps/web/src/components/dashboard/sidebar.tsx`
5. `apps/web/src/components/docs/docs-shell.tsx`
6. `apps/web/src/components/marketing/header.tsx`
7. `apps/web/src/components/ui/navigation-drawer.tsx` — new, untracked.

Exact SHA-256 file hashes are in [preplanning-wip-manifest.json](https://github.com/Coding-Frontend/actorconsole/tree/5469cd0f7506672e0e38105e08411079623ed676/audit/ui-ux/evidence/preplanning-wip-manifest.json); the complete preserved patch, including the new helper, is [preplanning-wip.patch.json](https://github.com/Coding-Frontend/actorconsole/tree/5469cd0f7506672e0e38105e08411079623ed676/audit/ui-ux/preplanning-wip.patch.json). The patch changes no server contract. It introduces a shared Radix mobile drawer, changes command-palette semantics/scrolling/shortcuts, adds docs-search focus handling, and updates one sidebar structure test. It is not integration-ready: two existing tools tests fail, and its shortcut change includes UI-10's unestablished integration case. No completed-fix claim is made.

WIP fixture checks pass for marketing containment/resize, admin Escape, palette title/selected-row visibility, conditional slash handling and docs search focus. Remaining findings persist. Broader route transitions, nested workspace/account menus, focus restoration across all shells and real assistive-technology behavior remain unverified.

## Remaining coverage, readiness and blockers

- **Pending implementation:** exact targets are the findings above and the two WIP test failures. Reason: user explicitly changed this phase to planning-only. Status: stopped/pending a future implementation phase; not an access denial or an uncertain tool outcome. No sandbox approval was rejected.
- **Not run here:** full monorepo type/lint/test/build, coverage gate, Gitleaks (not installed), frozen-lockfile reinstall, SCA/license analysis, database migrations, empty-DB boot, production-container boot, restore rehearsal, paid/sandbox payment providers, user/role authorization matrix, live email and full authenticated dashboard golden paths. These are separate owners' scopes; no missing gate is marked passed.
- **Browser limits:** Chromium keyboard/axe/component checks and selected built public pages were run. Screen readers, iOS Safari, Android browsers, touch keyboards, every authenticated route, long real-user datasets and full backend interruptions were not tested.
- **Ops/readiness:** runbook and deployment instructions were read as claims. Their backup/restore, monitoring, retention and incident procedures were not executed or certified by this UI owner.
- **Coordination:** auth owner should reference UI-03/UI-04 only for presentation behavior; keep server recovery/session/key issues separate. Workspace owner should reconcile UI-13's response-generation policy. Parent should integrate scoped documents rather than letting parallel owners overwrite a shared audit file.
- **Residual risk:** none accepted on the user's behalf. Suspected UI-10, remaining UI findings and verification gaps stay open.

Remediation sessions: [UI/UX remediation plan](../plans/ui-ux-remediation.md).
