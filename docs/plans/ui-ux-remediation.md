# UI/UX remediation sessions

## Implementation status after later user authorization

The user subsequently authorized implementation, commits and push of `fixes/actorconsole-20261026-ui`. Sessions 1–6 below have been implemented and locally verified for all 12 confirmed findings. Code commits are `4d595cb45c2dc124a36ffa6934f9d51311f0e623` and `5fb7fe358f336b16bee1fd55367dec7d8effae28`. The prior two route-test failures are resolved with all navigation assertions retained. Final frontend suite: **120 files, 594 passing tests, zero failures**; typecheck, zero-warning lint, production build, boundary and scoped browser checks pass.

UI-10 remains conditional/unestablished; the speculative hook change was removed. UI-12 remains rejected, with the actual built docs fitting all five widths. There are no server-contract, commercial/access/retention-policy or CI/CD changes, and no production/provider effects. No migration was required. The architecture chat remains the integration/publishing coordinator; main is not a push target. Final branch publication/remote SHA is reported in chat after normal push verification.

Exact changed application/test files, finding statuses, code commits, commands/results and remaining verification limits are in `audit/ui-ux/implementation-handoff.json`, the audit's current implementation section and `audit/ui-ux/evidence/implementation-*`. Installed Vite 5.4.21 versus manifest Vite 8 parity, full monorepo/coverage/Gitleaks, full backend flows and additional browser/assistive-device coverage remain unverified.

## Historical session plan

The plan below was written during the earlier planning-only phase. Its prohibitions and unresolved-WIP descriptions are retained for provenance; the later authorization and implementation status above supersede them. Baseline and evidence are in [the scoped audit](../audit/2026-10-ui-ux-audit.md). The original seven-file patch remains at `audit/ui-ux/preplanning-wip.patch.json`; do not apply it again on this branch.

The untouched frontend passes its gates. Product-owner UI launch policy is unresolved; sessions 1–4 address the strongest pre-launch acceptance risks. The existing WIP's two failing tests are an integration blocker. No migration is required by any session; none changes server contracts or CI/CD. Keep fixes in presentation ownership, and coordinate server-side or workspace-policy changes with their owners.

## Session 1 — Review preserved navigation WIP and restore compatibility

**Findings:** UI-01/UI-02, plus WIP compatibility failure.

**Exact files:** `apps/web/src/components/ui/navigation-drawer.tsx`, `apps/web/src/components/marketing/header.tsx`, `apps/web/src/components/admin/sidebar.tsx`, `apps/web/src/components/dashboard/sidebar.tsx`; tests `apps/web/test/components/marketing-header.test.tsx`, `apps/web/src/components/dashboard/sidebar.test.tsx`, `apps/web/src/app/(dashboard)/dashboard/tools/tools.test.tsx`. Add an admin-sidebar or shared-drawer behavioral test if needed.

**Test first:** reproduce focus remaining outside/escaping the open drawer; Escape dismisses every shell; focus returns to a visible opener; opening at 375px then resizing through 768px for dashboard or 1024px for marketing/admin releases scroll lock. Repeat opening/closing and both resize directions. Keep existing pricing/SEO route assertions and update structural queries only after confirming the chosen accessible landmark contract. Do not delete tests or reduce route coverage to get a pass.

**Implementation plan:** review the already preserved Radix helper against installed Dialog/FocusScope code. Decide the exact drawer title/landmark and opener association. Ensure on-close focus handling works for pointer, keyboard, route changes and breakpoint closure, including when the opener becomes hidden. Check nested workspace/account controls and duplicate desktop/mobile state; do not change workspace selection or server-access logic. Preserve existing marketing CTA policy. Keep mobile visual placement and desktop navigation behavior.

**Verification:** frontend Vitest full suite returns all tests green; typecheck, lint and build; browser at 320/375/768/1024/1440px with Tab, Shift+Tab, Escape, backdrop and nested dialogs. Compare scroll position before/after and allow the real exit animation to finish before evaluating scroll lock. Existing WIP appears to improve containment/resize, but does not establish full compatibility.

**Migration:** no. **Docs:** update `docs/audit/2026-10-ui-ux-audit.md` with exact evidence and close only verified items.

## Session 2 — Authenticator form dispatch and interrupted verification

**Findings:** UI-03/UI-04. UI owns presentation; auth owner owns backend 2FA/security policy.

**Exact file:** `apps/web/src/components/auth/email-password-form.tsx`. Add `apps/web/src/components/auth/email-password-form.test.tsx`; no API or auth-service edit is planned.

**Test first:** initial login response returns the synthetic challenge; type an authenticator code and press Enter; assert the next body contains both `totpCode` and `challengeToken`, with the existing credentials shape. Assert click and Enter dispatch the same verification operation. Also test a recovery-code string, blank code, network rejection, malformed JSON, API-declared failure, retained code/challenge on retry, and repeated pending submission invoking at most one operation through normal UI events.

**Implementation plan:** bind form submit to the currently displayed step, keep the verification control a correctly routed submit action, and catch verification rejection with visible accessible feedback. Add focus handoff to the code input only if the behavioral test establishes it is needed. Preserve callback validation, terms checks, server challenge semantics, password policy and all provider behavior. Do not add a client-only authentication bypass or change recovery-code validation.

**Verification:** targeted test file, then full frontend test/type/lint/build. Local built `/login` with browser-intercepted challenge and failure responses; no real users or provider calls. Capture exact POST keys on Enter and click, and no unhandled browser rejection.

**Migration:** no. **Docs:** close UI-03/UI-04 with UI-only evidence; link any separate auth-owner finding without duplicating it.

## Session 3 — Preserve drafts and make failed ticket closure retryable

**Findings:** UI-05/UI-08.

**Exact files:** `apps/web/src/components/marketing/contact-form.tsx`, `apps/web/src/components/dashboard/ticket-reply-box.tsx`; add corresponding `contact-form.test.tsx` and `ticket-reply-box.test.tsx` beside them. Existing `apps/web/src/components/ui/action-dialog.test.tsx` must remain intact.

**Test first:** hold each successful POST, type a different new draft, release the original success, and assert the new draft survives. Assert failed and malformed responses preserve entered content; unchanged successfully sent drafts clear according to existing behavior. For close: respond with 503, keep confirmation and error visible, retry with success, then dismiss exactly once. Verify normal repeated clicks/Enter during pending operations do not multiply requests.

**Implementation plan:** choose either preventing edits while sending or clearing only the captured submitted draft/version. Make that choice consistent and reviewable; preserve typed data through failures. Have the ticket-close callback communicate actual failure to ConfirmDialog rather than resolving as success. Keep error/retry in context and clear obsolete errors at the next attempt. No ticket endpoint, payload or close policy changes.

**Verification:** new tests plus existing action-dialog tests, full frontend suite, and deferred local browser responses. Capture sent body versus the retained new draft. Verify keyboard focus and disabled-state announcements.

**Migration:** no. **Docs:** UI-05/UI-08 evidence in the audit.

## Session 4 — Notification response ordering after workspace changes

**Finding:** UI-13. Coordinate workspace identity/access policy with the workspace/data owner before changing how a request is scoped.

**Exact files:** `apps/web/src/components/dashboard/notification-center.tsx` and `notification-center.test.tsx`. Reference event declaration `apps/web/src/components/dashboard/onboarding-gate.tsx:13`; no event contract or server endpoint change is planned.

**Test first:** defer A's GET, switch to B, resolve B, then resolve A; B must remain visible with B's unread count and no stale A error/loading mutation. Add A→B→A ordering, close/reopen while loading, failure then retry, and unmount during an outstanding request. Keep the existing preview-navigation assertions.

**Implementation plan:** cancel old requests and/or use a request generation that invalidates results, errors and finalizers after a workspace transition. Clear old workspace previews when switching. Follow the existing workspace context policy rather than inventing a new API scope header. Avoid claiming server IDOR was fixed by discarding an obsolete client result.

**Verification:** targeted race tests, full frontend suite and the bounded two-response `audit/ui-ux/notification-race.mjs` reproduction. If a backend identity change becomes necessary, stop at a precise coordination note for its owner; do not modify server contracts in this UI session.

**Migration:** no. **Docs:** UI-13 plus ownership note and ordering evidence.

## Session 5 — Command palette and docs keyboard access

**Findings:** UI-09/UI-11; review the preserved WIP in these files first.

**Exact files:** `apps/web/src/components/dashboard/command-palette.tsx`, `apps/web/src/components/docs/docs-shell.tsx`, `apps/web/src/components/docs/docs-shell.test.tsx`; add a colocated command-palette test.

**Test first:** named palette dialog; keyboard active selection is exposed and visible after navigating through more than one category; Enter opens the selected command; empty search and clearing search cannot leave a negative/out-of-range selection. At a short viewport the input and close action remain reachable. Docs click/Cmd/Ctrl+K focuses search, Escape restores a visible opener, persistent guide navigation preserves expected query/sidebar state.

**Implementation plan:** review the WIP's title, combobox/listbox semantics and item-node scrolling against installed Radix behavior. Ensure visual and keyboard indexes have the same ordering. Keep route/plan restrictions. For docs, add only the focus lifecycle; **do not make a 320px layout fix from UI-12**, which was rejected on the built app.

**Conditional UI-10:** establish an actual reachable editable/select/IME case before treating slash suppression as a product defect. The present contenteditable fixture alone is insufficient. Review the WIP hook change separately; preserve documented shortcuts and avoid introducing a policy change through a speculative fix.

**Verification:** focused tests then full frontend gate; built docs at all five widths and keyboard checks. Command palette in a disposable fixture with real root fonts/layout, plus a full authenticated local route only if the auth/stack owner provides disposable fixtures.

**Migration:** no. **Docs:** UI-09/UI-11 and explicit UI-10/UI-12 disposition.

## Session 6 — Contrast, pending labels and privacy affordance

**Findings:** UI-06/UI-07/UI-14.

**Exact files:** `apps/web/src/components/marketing/contact-form.tsx`, `apps/web/src/components/marketing/newsletter-subscribe.tsx`, `apps/web/src/components/marketing/newsletter-cta.tsx`; add or extend colocated form tests. Shared theme tokens in `globals.css` should remain unchanged unless a broader design decision is explicitly approved for implementation.

**Test first:** contact normal/hover/focus/disabled text in light/dark modes has the required contrast; newsletter action retains a meaningful accessible name through a deferred request, with success and failure feedback; privacy-policy text is a keyboard-activatable link to `/legal/privacy`. Verify error retry keeps the email, and success has an appropriate announcement. Do not add a false missing-name test based only on placeholder absence.

**Implementation plan:** use an existing accessible button pairing or a narrowly scoped proven alternative, retain pending action text or an accessible name while showing a decorative spinner, and replace the underlined policy span with navigation to the existing route. Preserve subscription request semantics and consent/policy wording.

**Verification:** contrast measurements on the built app, installed axe-core, pending/success/failure browser checks, and full frontend gate. Touch/narrow-width check at 320/375px; no provider email is sent.

**Migration:** no. **Docs:** close only the items with measured evidence in the audit; no changes to security/consent policy are implied.

## Integration checklist for the parent

- Keep this scoped plan separate from other owners' `remediation.md` changes until findings are reconciled.
- Preserve the current seven-file WIP and hashes; do not reset or silently count it as a finished fix.
- No application changes are authorized in the current planning phase.
- Do not declare the two WIP tests, full monorepo gates, lockfile parity, coverage, Gitleaks, backend authorization, full browser compatibility or ops readiness passed based on this UI report.
- After future scoped implementation, record base, exact file inventory, commands/results, remaining gaps and cross-owner references again. Do not push, merge or deploy without the user's separate authorized scope.
