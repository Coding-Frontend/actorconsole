# Branch consolidation review — 2026-11-01

The active ActorConsole checkout contains the Redis/database queue work, security remediation, SEO and social images, deployment fixes, and the latest origin/main publication/discovery history. Local work was committed as be15a19 and origin/main was reconciled in b6943dd.

Validation: 2,265 passing tests (49 skipped), 17 passing script tests, backend and frontend TypeScript checks, and a staged secret scan. The skipped tests require separately configured infrastructure.

Git reports one active checkout at H:/actorconsole.com. Its other registration points to a missing publication-observations folder; its publication-and-discovery-history branch is preserved. No branch or checkout was deleted.

A non-ancestor branch can contain changes already squash-merged or superseded. Older catalog proposals restore publication-date fallbacks that conflict with the current explicit publication/discovery separation. Older billing proposals omit newer payment-backed entitlement checks. The MCP publication-path fixes are already present with newer npm-processing verification. Those older branch tips were retained instead of replacing the current implementations. Dependency proposals requiring version/API migration remain pending; they are not represented as merged.

| Branch | Review status |
| --- | --- |
| `codex/dependency-pr-fixes` | Dependency proposal: retained for separate compatibility review |
| `codex/fix-builder-catalog-data` | Divergent older branch: retained; overlapping/newer implementation reviewed |
| `codex/fix-chart-missing-observation-bars` | Patch-equivalent changes already included |
| `codex/fix-mcp-publish-path` | Divergent older branch: retained; overlapping/newer implementation reviewed |
| `codex/fix-publication-dates-and-run-coverage` | Included in consolidated history |
| `codex/fix-schedule-queue-startup-race` | Patch-equivalent changes already included |
| `codex/mcp-npm-publishing` | Patch-equivalent changes already included |
| `codex/npm-publication-processing` | Patch-equivalent changes already included |
| `codex/pr-1-refresh` | Dependency proposal: retained for separate compatibility review |
| `codex/pr-10-refresh` | Dependency proposal: retained for separate compatibility review |
| `codex/pr-12-refresh` | Dependency proposal: retained for separate compatibility review |
| `codex/pr-2-refresh` | Dependency proposal: retained for separate compatibility review |
| `codex/pr-3-refresh` | Dependency proposal: retained for separate compatibility review |
| `codex/pr-4-refresh` | Dependency proposal: retained for separate compatibility review |
| `codex/pr-5-refresh` | Dependency proposal: retained for separate compatibility review |
| `codex/pr-6-refresh` | Dependency proposal: retained for separate compatibility review |
| `codex/pr-7-refresh` | Dependency proposal: retained for separate compatibility review |
| `codex/pr-8-refresh` | Dependency proposal: retained for separate compatibility review |
| `codex/pr-9-react-alignment` | Dependency proposal: retained for separate compatibility review |
| `codex/pr-batch-2-compatible` | Dependency proposal: retained for separate compatibility review |
| `codex/pr-batch-3-maintenance` | Dependency proposal: retained for separate compatibility review |
| `codex/public-release-hardening` | Patch-equivalent changes already included |
| `codex/publication-and-discovery-history` | Patch-equivalent changes already included |
| `codex/remove-cloudflare-pages` | Patch-equivalent changes already included |
| `codex/remove-obsolete-pages-env` | Patch-equivalent changes already included |
| `dependabot/npm_and_yarn/compatible-updates-6de259a32c` | Dependency proposal: retained for separate compatibility review |
| `origin` | Included in consolidated history |
| `origin/codex/fix-mcp-publish-path` | Divergent older branch: retained; overlapping/newer implementation reviewed |
| `origin/codex/fix-publication-dates-and-run-coverage` | Included in consolidated history |
| `origin/codex/mcp-npm-publishing` | Patch-equivalent changes already included |
| `origin/codex/npm-publication-processing` | Patch-equivalent changes already included |
| `origin/codex/remove-cloudflare-pages` | Patch-equivalent changes already included |
| `origin/codex/remove-obsolete-pages-env` | Patch-equivalent changes already included |
| `origin/dependabot/github_actions/actions/setup-node-7` | Dependency proposal: retained for separate compatibility review |
| `origin/dependabot/github_actions/docker/setup-buildx-action-4` | Dependency proposal: retained for separate compatibility review |
| `origin/dependabot/npm_and_yarn/apps/api/nodemailer-10.0.10` | Dependency proposal: retained for separate compatibility review |
| `origin/dependabot/npm_and_yarn/apps/worker/nodemailer-10.1.4` | Dependency proposal: retained for separate compatibility review |
| `origin/dependabot/npm_and_yarn/compatible-updates-c1b83cd9c1` | Dependency proposal: retained for separate compatibility review |
| `origin/dependabot/npm_and_yarn/cron-parser-5.10.2` | Dependency proposal: retained for separate compatibility review |
| `origin/dependabot/npm_and_yarn/happy-dom-21.0.3` | Dependency proposal: retained for separate compatibility review |
| `origin/dependabot/npm_and_yarn/hono/node-server-2.1.5` | Dependency proposal: retained for separate compatibility review |
| `origin/dependabot/npm_and_yarn/lucide-react-1.59.0` | Dependency proposal: retained for separate compatibility review |
| `origin/dependabot/npm_and_yarn/nodemailer-10.1.4` | Dependency proposal: retained for separate compatibility review |
| `origin/dependabot/npm_and_yarn/typescript-6.0.3` | Dependency proposal: retained for separate compatibility review |
| `origin/dependabot/npm_and_yarn/zod-4.6.7` | Dependency proposal: retained for separate compatibility review |
| `origin/fixes/actorconsole-20261026` | Patch-equivalent changes already included |
| `origin/fixes/actorconsole-20261026-actors` | Patch-equivalent changes already included |
| `origin/fixes/actorconsole-20261026-api` | Patch-equivalent changes already included |
| `origin/fixes/actorconsole-20261026-auth` | Patch-equivalent changes already included |
| `origin/fixes/actorconsole-20261026-billing` | Divergent older branch: retained; overlapping/newer implementation reviewed |
| `origin/fixes/actorconsole-20261026-focus` | Patch-equivalent changes already included |
| `origin/fixes/actorconsole-20261026-ui` | Divergent older branch: retained; overlapping/newer implementation reviewed |

## Confirmed squash-merge history

The repository PR history provides additional evidence for the older divergent tips:

- PR #9 incorporated dependency/CI branches #1–#8, #10, #12 and #13.
- PR #23 incorporated the second compatible dependency batch; PR #27 incorporated editor, extension and Resend updates.
- PR #37 incorporated the Zod 4, Vite 8 and Sentry 11 compatibility work.
- PR #50 incorporated the reviewed billing, queue, security and UI fixes, with subsequent hardening retained here.
- PR #52 incorporated catalog availability/revenue/history fixes; PR #59 supplies the newer explicit publication/discovery behavior.
- PRs #14–#16 incorporated MCP publishing, absolute tarball paths and npm-processing verification.

These old tips do not require replaying their commits to recover their functionality. The table records Git ancestry/patch divergence, rather than claiming those older dependency batches were never incorporated. New proposals such as cron-parser 5, TypeScript 6, Hono Node server 2 and Lucide 1 remain separate compatibility work.
