import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const validKey = `al_${"a".repeat(64)}`;
const revokedKey = `al_${"d".repeat(64)}`;
const mcpRoot = fileURLToPath(new URL("..", import.meta.url));
let apiServer: Server;
let apiBaseUrl: string;
const children: ChildProcess[] = [];

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No test port"));
      resolve(address.port);
    });
  });
}

async function freePort(): Promise<number> {
  const server = createServer();
  const port = await listen(server);
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForHealth(url: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The spawned server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

beforeEach(async () => {
  apiServer = createServer((request, response) => {
    const authorization = request.headers.authorization;
    if (authorization === `Bearer ${revokedKey}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: { message: "Credential revoked" } }));
      return;
    }
    if (authorization !== `Bearer ${validKey}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: { message: "Invalid credential" } }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        data: {
          name: "actorconsole-mcp",
          version: "0.2.0",
          transport: "test",
          permissions: ["workspace:read"],
          actorScope: "all",
          tools: ["get_mcp_capabilities"],
        },
      }),
    );
  });
  apiBaseUrl = `http://127.0.0.1:${await listen(apiServer)}`;
});

afterEach(async () => {
  for (const child of children.splice(0)) {
    child.kill("SIGTERM");
  }
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

describe("MCP transports", () => {
  it("serves a real stdio client with the configured workspace credential", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "src/index.ts"],
      cwd: mcpRoot,
      env: {
        ...process.env,
        // CI also configures hosted HTTP; this fixture must select stdio explicitly.
        MCP_TRANSPORT: "stdio",
        ACTORCONSOLE_API_KEY: validKey,
        API_BASE_URL: apiBaseUrl,
        OTEL_SDK_DISABLED: "true",
      } as Record<string, string>,
      stderr: "pipe",
    });
    const client = new Client({ name: "actorconsole-stdio-e2e", version: "1.0.0" });
    try {
      await client.connect(transport);
      const result = await client.callTool({ name: "get_mcp_capabilities", arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result.content)).toContain("workspace:read");
    } finally {
      await client.close();
    }
  }, 20_000);

  it("authenticates every hosted HTTP request against ActorConsole", async () => {
    const port = await freePort();
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts", "--http"], {
      cwd: mcpRoot,
      env: {
        ...process.env,
        API_BASE_URL: apiBaseUrl,
        MCP_PORT: String(port),
        MCP_HOST: "127.0.0.1",
        OTEL_SDK_DISABLED: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    await waitForHealth(`http://127.0.0.1:${port}/health`);

    const initialize = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "actorconsole-http-e2e", version: "1.0.0" },
      },
    };
    const valid = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${validKey}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(initialize),
    });
    expect(valid.status).toBe(200);
    expect(await valid.text()).toContain("actorconsole");

    const clients = ["http-client-a", "http-client-b"].map(
      (name) => new Client({ name, version: "1.0.0" }),
    );
    try {
      await Promise.all(
        clients.map((client) =>
          client.connect(
            new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
              requestInit: { headers: { authorization: `Bearer ${validKey}` } },
            }),
          ),
        ),
      );
      const catalogs = await Promise.all(clients.map((client) => client.listTools()));
      expect(catalogs.every((catalog) => catalog.tools.length === 49)).toBe(true);
      for (const client of clients) {
        const result = await client.callTool({ name: "get_mcp_capabilities", arguments: {} });
        expect(result.isError).not.toBe(true);
        expect(JSON.stringify(result.content)).toContain("workspace:read");
      }
    } finally {
      await Promise.all(clients.map((client) => client.close()));
    }

    const revoked = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${revokedKey}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(initialize),
    });
    expect(revoked.status).toBe(401);
    expect(await revoked.text()).toContain("Credential revoked");
  }, 20_000);
});
