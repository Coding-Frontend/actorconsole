#!/usr/bin/env node
// MCP entry point. Picks stdio (default) or HTTP transport via --http flag.

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { createServer } from "./server.js";
import { getRequestMetadata, runWithMcpRequestContext } from "./lib/request-context.js";
import { WorkspaceStdioTransport } from "./lib/stdio-transport.js";
import { ActorConsoleApiError, verifyActorConsoleMcpAccess } from "./lib/actorconsole-api.js";
import { getLogger } from "./lib/logger.js";
import { initOpenTelemetry } from "@actorconsole/shared/telemetry";
import { version } from "../package.json";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`ActorConsole MCP ${version}

Usage: actorconsole-mcp [--http] [--help] [--version]

Default: stdio transport for Claude Code, Codex, Cursor, and other MCP clients.
--http:  serve Streamable HTTP on MCP_HOST:MCP_PORT (default port 4100).

ACTORCONSOLE_API_KEY  Workspace MCP credential (required for stdio).
API_BASE_URL         ActorConsole API (default http://localhost:4000).
MCP_TRANSPORT        Set to http as an alternative to --http.
MCP_PORT / MCP_HOST  Hosted transport port and bind address.
                     Default host: 127.0.0.1, or 0.0.0.0 in production.

Create a credential in Dashboard → MCP access.
Documentation: http://localhost:8080/docs/mcp-tools
`);
  process.exit(0);
}
if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write(`${version}\n`);
  process.exit(0);
}
if (args.some((arg) => arg !== "--http")) {
  process.stderr.write("Unknown argument. Run actorconsole-mcp --help for usage.\n");
  process.exit(1);
}

const useHttp = process.argv.includes("--http") || process.env.MCP_TRANSPORT === "http";
if (!useHttp && !/^al_[a-f0-9]{64}$/.test(process.env.ACTORCONSOLE_API_KEY ?? "")) {
  process.stderr.write(
    "Set ACTORCONSOLE_API_KEY to a workspace MCP credential from Dashboard → MCP access.\n",
  );
  process.exit(1);
}
const log = getLogger("mcp");
await initOpenTelemetry("actorconsole-mcp", log);
const MAX_HTTP_BODY_BYTES = 1_048_576;

async function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_HTTP_BODY_BYTES) throw new Error("payload_too_large");
    chunks.push(buffer);
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("invalid_json");
  }
}

if (useHttp) {
  const port = Number(process.env.MCP_PORT ?? 4100);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("MCP_PORT must be an integer between 1 and 65535");
  }
  const activeServers = new Set<Awaited<ReturnType<typeof createServer>>>();
  const { createServer: createHttpServer } = await import("node:http");
  const httpServer = createHttpServer(async (req, res) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("cache-control", "no-store");

    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "actorconsole-mcp", transport: "http" }));
      return;
    }
    if (pathname !== "/mcp" && pathname !== "/") {
      res.writeHead(404).end();
      return;
    }

    const authorization = req.headers.authorization;
    const supplied = authorization?.replace(/^Bearer\s+/i, "") ?? req.headers["x-api-key"];
    const suppliedKey = Array.isArray(supplied) ? supplied[0] : supplied;
    if (!suppliedKey || !/^al_[a-f0-9]{64}$/.test(suppliedKey)) {
      res.setHeader("www-authenticate", "Bearer");
      res.writeHead(401, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "unauthorized",
          message: "A valid workspace MCP credential is required",
        }),
      );
      return;
    }

    const contentLength = Number(req.headers["content-length"] ?? 0);
    if (!Number.isFinite(contentLength) || contentLength > MAX_HTTP_BODY_BYTES) {
      res.writeHead(413, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "payload_too_large" }));
      return;
    }

    try {
      const parsedBody = req.method === "POST" ? await readJsonBody(req) : undefined;
      const { toolName, actorIds } = getRequestMetadata(parsedBody);
      await runWithMcpRequestContext(
        {
          actorConsoleApiKey: suppliedKey,
          requestId: String(req.headers["x-request-id"] ?? randomUUID()),
          transport: "http",
          toolName,
          actorIds,
        },
        async () => {
          await verifyActorConsoleMcpAccess();
          if (req.method !== "POST") {
            res.setHeader("allow", "POST");
            res.writeHead(405).end();
            return;
          }
          // Stateless SDK transports handle exactly one HTTP request. Sharing
          // one instance breaks notifications and collides across clients.
          const requestServer = await createServer();
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
          });
          activeServers.add(requestServer);
          res.once("close", () => {
            activeServers.delete(requestServer);
            void requestServer.close().catch(() => log.warn("MCP request cleanup failed"));
          });
          await requestServer.connect(transport);
          await transport.handleRequest(req, res, parsedBody);
        },
      );
    } catch (error) {
      if (error instanceof Error && error.message === "payload_too_large") {
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "payload_too_large" }));
        return;
      }
      if (error instanceof Error && error.message === "invalid_json") {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_json" }));
        return;
      }
      if (error instanceof ActorConsoleApiError) {
        if (error.status === 401) res.setHeader("www-authenticate", "Bearer");
        res.writeHead(error.status, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error:
              error.status === 401 || error.status === 403
                ? "unauthorized"
                : "actorconsole_api_error",
            message: error.message,
          }),
        );
        return;
      }
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
      }
      if (!res.writableEnded) res.end(JSON.stringify({ error: "internal_error" }));
    }
  });
  httpServer.requestTimeout = 30_000;
  httpServer.headersTimeout = 10_000;
  httpServer.keepAliveTimeout = 5_000;

  const host =
    process.env.MCP_HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  httpServer.listen(port, host, () => {
    log.info({ host, port, path: "/mcp" }, "MCP HTTP transport listening");
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    httpServer.close();
    httpServer.closeAllConnections();
    await Promise.all([...activeServers].map((server) => server.close()));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
} else {
  const server = await createServer();
  const transport = new WorkspaceStdioTransport();
  await server.connect(transport);
}
