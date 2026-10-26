# Disposable UI audit harness

This directory contains audit scratch fixtures, raw evidence and the preserved pre-planning application patch. It does not alter application routes, CI or test gates. The report is `docs/audit/2026-10-ui-ux-audit.md`; the plan is `docs/plans/ui-ux-remediation.md`.

## Validated implementation handoff

Later user authorization allowed the scoped fixes and branch handoff. Current status is in `implementation-handoff.json`; final evidence is under `evidence/implementation-*`. The original baseline/WIP evidence below remains historical. Run the current fixture server on 4188, then:

```bash
UI_AUDIT_URL=http://127.0.0.1:4188/harness.html UI_EXPECT_FIXED=1 UI_AUDIT_SNAPSHOT=implementation UI_AUDIT_OUTPUT=/tmp/ui-implementation-browser.json node audit/ui-ux/browser-audit.mjs
UI_AUDIT_ORIGIN=http://127.0.0.1:4188 UI_EXPECT_FIXED=1 UI_AUDIT_SNAPSHOT=implementation UI_AUDIT_OUTPUT=/tmp/ui-implementation-notification.json node audit/ui-ux/notification-race.mjs
node audit/ui-ux/navigation-regression.mjs
```

The fixed-issue mode explicitly excludes UI-10 (suspected, no editable integration established) and UI-12 (disproved on real Next). It retains every confirmed behavior assertion. `next-implementation.mjs` checks the built frontend on loopback 4191 with locally intercepted POST responses, matching the environment setup below. No real backend/provider request is sent.

## Recreate the untouched source snapshot

From `/workspace/actorconsole`, choose a new disposable directory if the existing one already exists. The recorded snapshot was built from `fc52f547286b14de2f483899b4aa5dcdfca8b5ea`, not the modified working files.

```bash
mkdir -p /tmp/actorconsole-ui-ux-base
git archive fc52f547286b14de2f483899b4aa5dcdfca8b5ea | tar -x -C /tmp/actorconsole-ui-ux-base
ln -s /workspace/actorconsole/node_modules /tmp/actorconsole-ui-ux-base/node_modules
ln -s /workspace/actorconsole/apps/web/node_modules /tmp/actorconsole-ui-ux-base/apps/web/node_modules
```

No real `.env` file is included in `git archive`. Use installed dependencies; this does not establish frozen-lockfile parity.

## Component browser fixture

Start one fixture in a terminal:

```bash
UI_AUDIT_BASELINE=/tmp/actorconsole-ui-ux-base UI_AUDIT_PORT=4190 node audit/ui-ux/harness-server.mjs
```

Then run from repository root:

```bash
node audit/ui-ux/browser-audit.mjs
node audit/ui-ux/notification-race.mjs
```

The browser scripts fulfill API responses locally and block non-loopback browser traffic. Each failure is a failed correct-behavior assertion, not a failed install or live attack. The notification fixture uses exactly two GET responses. Evidence defaults to `/tmp/ui-ux-baseline-evidence.json` and `/tmp/ui-ux-notification-race.json`. `CHROMIUM_PATH` can select an installed Chromium executable. The recorded run used `/usr/bin/chromium` within the execution sandbox.

To inspect preserved WIP instead, start the server without `UI_AUDIT_BASELINE` on port 4188 and run:

```bash
UI_AUDIT_URL=http://127.0.0.1:4188/harness.html UI_AUDIT_SNAPSHOT=preplanning-wip UI_AUDIT_OUTPUT=/tmp/ui-ux-wip-evidence.json node audit/ui-ux/browser-audit.mjs
```

The standalone fixture omits the real Next root layout/fonts. Its docs clipping hypothesis was **rejected** by the built app; keep that limitation when interpreting the raw assertion totals. The slash/contenteditable check is also conditional until an actual editable dashboard integration is established. Do not use those fixture assertions to claim confirmed product defects.

## Frontend gates used

From the selected snapshot's `apps/web` directory:

```bash
node /workspace/actorconsole/node_modules/typescript/bin/tsc --noEmit --incremental false
node /workspace/actorconsole/node_modules/eslint/bin/eslint.js . --max-warnings=0
node /workspace/actorconsole/node_modules/vitest/vitest.mjs run
API_BASE_URL=http://127.0.0.1:4199 NEXT_PUBLIC_API_BASE_URL=/api NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4191 SENTRY_AUTH_TOKEN= NEXT_TELEMETRY_DISABLED=1 node /workspace/actorconsole/node_modules/next/dist/bin/next build
```

The primary checkout's build also explicitly blanked Firebase's public settings to avoid initializing configured providers. Run the above in the archived snapshot, which has no real environment file. An unused loopback backend is intentional; these checks do not certify full-stack operation.

## Real built baseline pages

The recorded run started Next from the disposable baseline using the same local API origin and `next start -H 127.0.0.1 -p 4191`. Next printed its standalone-output warning but started successfully. A disposable browser checked `/docs/first-workspace`, `/login` and `/contact`; all returned 200. Login/contact POSTs were fulfilled by browser fixtures, never sent to a backend. Results are in `evidence/next-baseline-pages.json` and `evidence/next-baseline-contact.json`.

The recorded checks were executed inline with `node --input-type=module`. Their code is preserved for replay as `node audit/ui-ux/next-baseline-pages.mjs` and `node audit/ui-ux/next-baseline-contact.mjs`. Those replay files were syntax-checked after transcription, without repeating the completed browser checks.

Screenshots of synthetic local UI were kept outside the source tree at `/tmp/ui-ux-real-baseline-docs-320.png` and `/tmp/ui-ux-baseline-320.png`; the latter is an incomplete-root fixture and is not authoritative layout evidence.

## Preservation

`preplanning-wip.patch` contains all seven application/test files changed before the user's planning-only instruction. `evidence/preplanning-wip-manifest.json` records their exact hashes. Applying it to the current working tree would duplicate already preserved changes. No branch, commit or publication was performed.
