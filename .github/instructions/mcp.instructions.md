---
applyTo: "apps/mcp/**"
description: "Instructions for the Model Context Protocol server."
---

# apps/mcp — Model Context Protocol Server

## Stack
- **@modelcontextprotocol/sdk** — MCP server implementation
- **Zod** for tool input validation
- **ActorConsole API** — authenticated REST proxy for Apify and AI workflows
- **@actorconsole/shared** — Types, helpers, keyword extraction

## General Conventions
- **TypeScript strict mode**, ES modules (`"type": "module"`), target ES2022.
- **Import with `.js` extensions** for relative imports.
- **Import packages** by name and route product operations through `actorConsoleApi()`.
- **No `console.log`** — use the structured logger for startup, error results via `errorResult()`.
- **Environment:** `ACTORCONSOLE_API_KEY` and `API_BASE_URL`; the API owns provider credentials.

## Transport
- **Stdio** (default) — for CLI integration (Claude Code, Codex, Cursor)
- **HTTP** (`--http` flag or `MCP_TRANSPORT=http`) — StreamableHTTP on `MCP_PORT` (default 4100)

## Entry point (`src/index.ts`)
Picks stdio or HTTP based on `--http` CLI flag or `MCP_TRANSPORT` env var. Creates server via `createServer()` from `src/server.ts`.

## Server setup (`src/server.ts`)
`createServer()` builds an `McpServer` instance and registers all tool groups:
```ts
registerActorTools(server);
registerOptimizeTools(server);
registerPricingTools(server);
registerKeywordTools(server);
registerScheduleTools(server);
registerRevenueTools(server);
```

## Tool structure
Tools live in `src/tools/<domain>.ts`. Each file exports a `register<Domain>Tools(server: McpServer)` function.

### Tool domains
- `actors.ts` — `list_actors`, `get_actor`
- `optimize.ts` — `optimize_actor` (AI copy rewrite, categories, schemas, and README)
- `pricing.ts` — pricing tools
- `keywords.ts` — keyword research tools
- `schedules.ts` — schedule management tools
- `revenue.ts` — revenue analytics tools

### Tool pattern
```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult, errorResult } from "../lib/respond.js";

export function registerMyTools(server: McpServer) {
  server.tool(
    "tool_name",                // tool name (snake_case)
    "Human-readable description", // shown to the AI agent
    {                            // Zod input schema
      param1: z.string().describe("Description of param"),
      param2: z.number().optional().default(10),
    },
    async ({ param1, param2 }) => {
      try {
        // ... logic
        return jsonResult(data);      // success
      } catch (err) {
        return errorResult("Failed to do X", String(err));  // error
      }
    },
  );
}
```

### Response helpers (`src/lib/respond.ts`)
- `textResult(text)` — plain text MCP response
- `jsonResult(data)` — JSON-stringified response (auto-calls `JSON.stringify(data, null, 2)`)
- `errorResult(message, details?)` — error response with `isError: true`

## Auth
- `ACTORCONSOLE_API_KEY` env var — scoped personal key for API-to-API authentication
- `API_BASE_URL` env var — ActorConsole API origin; HTTPS is required in production

## Key patterns
- **Always wrap tool handlers in try/catch** — MCP tools must never throw; return `errorResult()` instead.
- **Use `actorConsoleApi()`** — all tool calls inherit the API key's plan, scopes, and actor restrictions.
- **AI and Apify calls** are performed by the authenticated API, so provider credentials never enter the MCP process.
- **Keyword extraction** via `extractKeywords()` from `@actorconsole/shared`.
- **Language detection** via `inferActorLanguage()` from `@actorconsole/shared`.

## Scripts
- `pnpm dev` — `tsx watch src/index.ts` (stdio mode)
- `pnpm dev:http` — `tsx watch src/index.ts --http` (HTTP mode, port 4100)
- `pnpm build` — `tsc`
