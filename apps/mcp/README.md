# @actorconsole/mcp

ActorConsole's workspace-bound Model Context Protocol server for Codex, Claude
Code, Cursor, and other MCP clients. It exposes Actor operations, notifications,
optimization proposals, usage and revenue reports, and guarded
bulk publishing through the same ActorConsole API used by the dashboard.

The server never accepts an Apify API token, Apify UI token, or browser cookie
from an MCP client. Those credentials remain encrypted in the selected
ActorConsole workspace.

## Requirements and installation

- Node.js **20.19 or newer**, with npm/npx available to your MCP client.
- An ActorConsole account, a selected workspace, and a workspace MCP credential.
- A connected Apify account for workflows that use its Actors or reports.

After this package has been published, no repository checkout, pnpm, database,
Redis, Apify SDK, or private npm packages are required on the client machine:

```bash
npx -y @actorconsole/mcp@0.2.2 --help
npx -y @actorconsole/mcp@0.2.2 --version
```

Your MCP client starts the long-running stdio server using the configuration
below. Alternatively, install it with `npm install -g @actorconsole/mcp`
and run `actorconsole-mcp`.

`API_BASE_URL` defaults to `http://localhost:4000`. Override it for a
different ActorConsole deployment or local development. Production URLs must
use HTTPS. Startup and tracing diagnostics go to stderr, keeping stdio output
reserved for MCP messages.

Free includes MCP access. Operational tools follow workspace plan limits:
workspaces above 50 Actors or 500 reported monthly Actor users require Pro for
the affected operations. Capabilities and Actor restrictions apply on every plan.

## Access model

Create a credential in **Dashboard → MCP access** while the intended workspace
is selected. A credential is permanently bound to that workspace and can be
restricted by:

- granular capabilities such as `actors:read`, `actors:optimize`,
  `publishing:write`, or `publishing:run`;
- an allowlist of tracked Actors;
- an expiry date and manual revocation.

An Actor allowlist can contain up to 100 tracked Actors. The server registers
the tool catalog shown at [Available MCP Tools](http://localhost:8080/docs/mcp-tools);
`get_mcp_capabilities` reports the tools, resources, and prompts usable by the
current credential.

Hosted HTTP requests are authenticated independently with the caller's
workspace credential. There is no shared server-wide `MCP_API_KEY`. Stdio uses
`ACTORCONSOLE_API_KEY` from the local client process.

## Stdio configuration

Claude Code and Cursor accept the standard JSON server entry below:

```json
{
  "mcpServers": {
    "actorconsole": {
      "command": "npx",
      "args": ["-y", "@actorconsole/mcp"],
      "env": {
        "ACTORCONSOLE_API_KEY": "al_your_workspace_mcp_credential",
        "API_BASE_URL": "http://localhost:4000"
      }
    }
  }
}
```

Codex uses the equivalent TOML entry:

```toml
[mcp_servers.actorconsole]
command = "npx"
args = ["-y", "@actorconsole/mcp"]

[mcp_servers.actorconsole.env]
ACTORCONSOLE_API_KEY = "al_your_workspace_mcp_credential"
API_BASE_URL = "http://localhost:4000"
```

From this monorepo:

```bash
ACTORCONSOLE_API_KEY=al_your_workspace_mcp_credential \
API_BASE_URL=http://localhost:4000 \
pnpm --filter @actorconsole/mcp dev
```

## Hosted HTTP configuration

Start the streamable HTTP transport with:

```bash
MCP_TRANSPORT=http MCP_PORT=4100 \
API_BASE_URL=http://localhost:4000 \
npx -y @actorconsole/mcp --http
```

Connect the client to `https://your-mcp-host.example/mcp` and send its own
workspace credential as `Authorization: Bearer al_…`. `/health` is public and
contains no workspace data. Every other MCP request is verified by the
ActorConsole API before it reaches discovery, resources, prompts, or tools.

## Capability groups

| Capability                                                | Allows                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `workspace:read`                                          | Read the bound workspace                                                |
| `actors:read`                                             | Actor inventory, status, current metadata, and listing context          |
| `actors:sync`                                             | Refresh tracked Actor data from Apify                                   |
| `actors:optimize`                                         | Create reviewable listing copy and pricing proposals                    |
| `actors:write`                                            | Apply explicitly approved Actor changes and status updates              |
| `notifications:read` / `notifications:write`              | Read or acknowledge notifications                                       |
| `usage:read`                                              | Day/month, absolute/cumulative usage, performance, revenue, and history |
| `pricing:read` / `pricing:write`                          | Inspect recommendations/history or apply pricing                        |
| `publishing:read` / `publishing:write` / `publishing:run` | Inspect, edit, or execute publishing queues                             |

Credentials created before granular capabilities were introduced remain
compatible, but should be rotated into least-privilege credentials.

## Tools

The server exposes these tool families:

- **Workspace:** `get_workspace`, `get_mcp_capabilities`, `get_mcp_usage`.
- **Actors:** `list_actors`, `get_actor`, `list_published_actors`,
  `list_maintenance_actors`, `list_deprecated_actors`, `list_unpublished_actors`,
  `list_publish_ready_actors`, `sync_actors`.
- **Notifications:** `list_notifications`, `get_unread_notification_count`,
  `mark_notification_read`, `mark_all_notifications_read`.
- **Optimization:** `analyze_actor`, `rewrite_actor_title_description`,
  `rewrite_actor_listing`, `create_actor_optimization_run`,
  `get_actor_optimization_run`, `apply_actor_changes`, `get_actor_change_status`.
- **Pricing:** `get_pricing`, `set_pricing`, `recommend_pricing`,
  `get_pricing_history`.
- **Store research:** `search_actors`, `keyword_competitors`.
- **Usage and revenue:** `get_usage_costs`, `get_actor_performance`,
  `get_actor_revenue`, `get_workspace_usage`, `get_workspace_revenue`,
  `get_usage_history`. Actor revenue supports day/month granularity and
  absolute/cumulative modes over a 1–180 day window.
- **Store lifecycle:** `change_actor_store_status`,
  `list_actor_status_operations`, `get_actor_status_operation`.
- **Publishing queues:** `list_publishing_schedules`, `get_publishing_schedule`,
  `create_publishing_schedule`, `update_publishing_schedule`,
  `add_actors_to_publishing_schedule`, `remove_actors_from_publishing_schedule`,
  `pause_publishing_schedule`, `resume_publishing_schedule`,
  `run_publishing_schedule`, `list_publishing_runs`, `get_publishing_run`,
  `requeue_publishing_actor`.

All **49 tools** are included in the npm distribution. Exact inputs, capabilities,
limits, and behavior are documented at
[Available MCP Tools](http://localhost:8080/docs/mcp-tools).

Publishing tools accept ActorConsole internal Actor IDs from the `id` field of
`list_actors` results. Most single-Actor read tools accept `apifyActorId`.

`get_actor_change_status` reads the same run status as
`get_actor_optimization_run`. `get_actor_performance` focuses on run and cost
metrics; use `get_actor_revenue` for creator revenue. Tool calls return errors
when the credential lacks a required capability or Actor access.

## Resources and prompts

Resources include `actorconsole://workspace`, `actorconsole://actors`, Actor
detail templates, notifications, and publishing schedules. They obey
the same capability and Actor restrictions as tools.
The Actors resource lists the first 500 tracked Actors; use `list_actors` to
page beyond that.

Bundled prompts cover Actor listing optimization, maintenance
review and publishing preparation, and deprecated-Actor review. Prompts that
lead to mutations explicitly stop at the review boundary.

## Mutation safety

- Optimization and rewrite tools create proposals first. `apply_actor_changes`
  requires explicit result IDs and fields.
- Publishing schedules are created paused unless `enabled: true` is supplied.
- Publishing-schedule creation and manual runs support idempotency keys.
- Apify's daily publication limit stops the current run; unfinished Actors stay
  ordered for a later run.
- Actor-restricted credentials cannot read aggregate data, run history, or
  schedules containing Actors outside their allowlist.
- Requests are rate-limited and recorded in the workspace audit log without
  request bodies, secrets, source text, or generated README content.

## Common errors

| Status | Meaning                                                          |
| ------ | ---------------------------------------------------------------- |
| `401`  | Missing, malformed, expired, or revoked MCP credential           |
| `403`  | Plan, capability, feature, or Actor-scope restriction            |
| `409`  | Workspace prerequisite, duplicate active run, or review conflict |
| `413`  | Hosted MCP request exceeds the 1 MiB transport limit             |
| `429`  | Per-key, per-workspace, or per-tool rate limit reached           |
| `503`  | Queue, MCP transport, or dependent service is unavailable        |

## Development

```bash
pnpm --filter @actorconsole/mcp typecheck
pnpm --filter @actorconsole/mcp test
pnpm --filter @actorconsole/mcp build
```

## Release to npm

GitHub Actions publishes this package when a version tag such as `mcp-v0.2.2`
is pushed. Stable versions publish to `latest`; prereleases such as
`mcp-v0.3.0-rc.1` publish to `next`. Tags must exactly match `package.json` and
point to a commit on `main` with successful CI and secret scanning. If the tag
is pushed while those checks run, the release waits up to 20 minutes for them.

For each release:

1. Bump `apps/mcp/package.json` to a new version and update the version examples.
2. Merge that change through a pull request to `main` and let CI pass.
3. Tag the merged commit and push the tag:

```bash
git switch main
git pull --ff-only
git tag -a mcp-v0.2.2 -m "Release @actorconsole/mcp 0.2.2"
git push origin mcp-v0.2.2
```

Only repository administrators may create or change `mcp-v*` tags. Published
npm versions are immutable; bump the version instead of moving an old tag.

The workflow runs type checks, lint, unit tests and the isolated package smoke
test below. A separate job verifies the tested tarball's SHA-512 digest and
publishes that exact artifact with provenance. The publish job runs no package
scripts and receives no permanent npm token. It then verifies the registry's
package integrity and provenance, allowing up to 15 minutes of polling for npm's
publish-time processing (plus request timeouts). A mismatched digest fails
immediately. Pull requests run packaging checks without
publishing permissions. The VPS deployment is independent of version tags.

### One-time trusted publisher setup

The npm package owner must add a GitHub Actions trusted publisher in the
[package settings](https://www.npmjs.com/package/@actorconsole/mcp/access):

- GitHub owner: `Coding-Frontend`
- Repository: `actorconsole`
- Workflow filename: `publish-mcp.yml`
- Environment: `npm`
- Allow direct publishing with `npm publish`.

The GitHub `npm` environment must allow only tags matching `mcp-v*`. Configure
the repository's MCP tag rules to restrict tag creation, changes and deletion
to administrators. Trusted publishing uses short-lived OIDC credentials; do
not add `NPM_TOKEN` or the application's API credentials to the workflow.
See [npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).
New trusted publisher connections must complete their first publish within
two days. Version `0.2.1` was the first MIT release from this repository;
published versions and their tags must not be reused or moved.

### Local package validation and manual recovery

From the repository root:

```bash
pnpm --filter @actorconsole/shared build
pnpm --filter @actorconsole/mcp typecheck
pnpm --filter @actorconsole/mcp lint
pnpm --filter @actorconsole/mcp test
```

Then, from `apps/mcp`:

```bash
npm run test:package
```

This builds and packs the release, installs it in a temporary project with only
public runtime dependencies, and checks all 49 tools, resources, prompts, stdio,
HTTP, audit metadata, CLI startup, and revoked credentials against a local test
API. It preserves the tested tarball at
`../../.cache/npm-release/actorconsole-mcp-0.2.2.tgz`.

Publish that exact artifact after logging in to npm with an account permitted to
publish under the `@actorconsole` scope:

```bash
npm login
npm publish ../../.cache/npm-release/actorconsole-mcp-0.2.2.tgz --access public
```

Packing rebuilds `dist` automatically. Publishing directly from this source
directory also runs the source type checks, lint, and tests. Publish only this
package; the application and other workspace packages remain private.
For later releases, change the package version, run the package check again,
and publish its newly generated tarball.

The build bundles MCP's internal pricing and telemetry modules. Public runtime
dependencies remain normal npm dependencies; `@actorconsole/shared` and
`@actorconsole/config` are development-only workspace dependencies. Optional
OpenTelemetry dependencies are used only when an OTLP endpoint is configured;
the normal MCP connection works with `npm install --omit=optional`.

The package also exports `createServer` for embedding without starting a CLI:

```js
import { createServer } from "@actorconsole/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = await createServer();
await server.connect(new StdioServerTransport());
```

When embedding, the host owns transport authentication and request context.
Use the CLI for the built-in stdio and HTTP authentication guards.

## License

MIT — © 2026 ActorConsole.
