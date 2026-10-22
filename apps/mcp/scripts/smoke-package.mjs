import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { apiFixture, toolCases } from "../test/tool-cases.mjs";

const exec = promisify(execFile);
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const artifactDir = resolve(packageDir, "../../.cache/npm-release");
const npmCli = [
  process.env.npm_execpath,
  join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
].find((path) => path && basename(path) === "npm-cli.js" && existsSync(path));
assert(npmCli, "Run this check with npm run test:package (npm CLI could not be located).");
const fixtureDir = await mkdtemp(join(tmpdir(), "actorconsole-mcp-smoke-"));
const requests = [];
const key = `al_${"a".repeat(64)}`;
const revoked = `al_${"d".repeat(64)}`;
const children = new Set();

async function npm(args, cwd) {
  return exec(process.execPath, [npmCli, ...args], {
    cwd,
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}
async function listen(server) {
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  return server.address().port;
}
async function waitForHealth(url, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    assert(child.exitCode === null, "Packed HTTP server exited before startup");
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Still starting. */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Packed HTTP server did not become healthy");
}

const api = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  const url = new URL(request.url, "http://localhost");
  requests.push({
    url,
    method: request.method,
    headers: request.headers,
    body: text ? JSON.parse(text) : undefined,
  });
  response.setHeader("content-type", "application/json");
  if (request.headers.authorization !== `Bearer ${key}`) {
    response.writeHead(401);
    response.end(JSON.stringify({ ok: false, error: { message: "Credential revoked" } }));
    return;
  }
  response.end(
    JSON.stringify({ ok: true, data: apiFixture(url.pathname), meta: { difficultyScore: 42 } }),
  );
});

try {
  await mkdir(artifactDir, { recursive: true });
  process.stderr.write(
    "Packing MCP and installing runtime dependencies in an isolated project...\n",
  );
  const packed = await npm(
    ["pack", "--json", "--silent", "--pack-destination", artifactDir],
    packageDir,
  );
  const pack = JSON.parse(packed.stdout.slice(packed.stdout.indexOf("[")))[0];
  const tarball = join(artifactDir, pack.filename);
  assert(
    pack.files.every(
      (file) => !/(?:\.env|\.tsbuildinfo|node_modules|^src\/|^test\/)/.test(file.path),
    ),
    "Unexpected private/build inputs in tarball",
  );
  await writeFile(
    join(fixtureDir, "package.json"),
    JSON.stringify({ name: "mcp-package-smoke", private: true, type: "module" }),
  );
  await npm(
    [
      "install",
      "--omit=dev",
      "--omit=optional",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      tarball,
    ],
    fixtureDir,
  );
  const installedDir = join(fixtureDir, "node_modules/@actorconsole/mcp");
  const manifest = JSON.parse(await readFile(join(installedDir, "package.json"), "utf8"));
  assert(!Object.keys(manifest.dependencies).some((name) => name.startsWith("@actorconsole/")));
  assert(!existsSync(join(fixtureDir, "node_modules/@actorconsole/shared")));
  const bin = join(installedDir, manifest.bin["actorconsole-mcp"]);
  assert((await readFile(bin, "utf8")).startsWith("#!/usr/bin/env node"));
  assert(
    existsSync(
      join(
        fixtureDir,
        "node_modules/.bin",
        process.platform === "win32" ? "actorconsole-mcp.cmd" : "actorconsole-mcp",
      ),
    ),
  );
  const { createServer: createPackedServer } = await import(
    pathToFileURL(join(installedDir, "dist/server.js")).href
  );
  const packedServer = await createPackedServer();
  await packedServer.close();

  const apiUrl = `http://127.0.0.1:${await listen(api)}`;
  const baseEnv = {
    ...process.env,
    API_BASE_URL: apiUrl,
    ACTORCONSOLE_API_KEY: key,
    OTEL_SDK_DISABLED: "true",
    NODE_PATH: "",
    MCP_TRANSPORT: "stdio",
    LOG_LEVEL: "info",
  };
  const cliVersion = await exec(process.execPath, [bin, "--version"], {
    cwd: fixtureDir,
    env: baseEnv,
  });
  assert.equal(cliVersion.stdout.trim(), manifest.version);
  const help = await exec(process.execPath, [bin, "--help"], { cwd: fixtureDir, env: baseEnv });
  assert(help.stdout.includes("ACTORCONSOLE_API_KEY"));
  await assert.rejects(
    exec(process.execPath, [bin], {
      cwd: fixtureDir,
      env: { ...baseEnv, ACTORCONSOLE_API_KEY: "" },
    }),
    (error) => error.code === 1 && error.stderr.includes("ACTORCONSOLE_API_KEY"),
  );

  // NODE_ENV unset is how npx normally starts. Production must also work without
  // pino-pretty, dev dependencies, or optional tracing dependencies installed.
  for (const mode of ["unset", "production"]) {
    const env = { ...baseEnv };
    if (mode === "unset") delete env.NODE_ENV;
    else env.NODE_ENV = mode;
    // The existing API policy requires HTTPS in production. Discovery can still
    // be tested with the packed programmatic server; CLI help/version also runs.
    if (mode === "production") {
      await exec(process.execPath, [bin, "--version"], { cwd: fixtureDir, env });
      // Run the stdio startup without a request to ensure runtime-only imports
      // and stderr diagnostics work before a production HTTPS call is made.
      const child = spawn(process.execPath, [bin], {
        cwd: fixtureDir,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      children.add(child);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      await new Promise((resolveStartup) => setTimeout(resolveStartup, 500));
      assert.equal(child.exitCode, null, stderr);
      assert.equal(stdout, "", "Startup polluted stdio protocol output");
      child.kill();
      continue;
    }
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bin],
      cwd: fixtureDir,
      env,
      stderr: "pipe",
    });
    const client = new Client({ name: "packed-mcp-smoke", version: "1.0.0" });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), Object.keys(toolCases).sort());
      assert.equal((await client.listPrompts()).prompts.length, 4);
      assert.equal((await client.listResources()).resources.length, 4);
      assert.equal((await client.listResourceTemplates()).resourceTemplates.length, 1);
      for (const [name, contract] of Object.entries(toolCases)) {
        requests.length = 0;
        const result = await client.callTool({ name, arguments: contract.args });
        assert(!result.isError, `Packed tool failed: ${name}: ${JSON.stringify(result)}`);
        const request = requests.at(-1);
        assert.equal(request.url.pathname, contract.path, name);
        assert.equal(request.method, contract.method, name);
        assert.equal(
          request.headers["x-actorconsole-mcp-tool"],
          name,
          "Stdio audit lost the tool name",
        );
        assert(request.headers["x-request-id"], "Stdio audit lost the request ID");
        for (const [queryKey, value] of Object.entries(contract.query ?? {}))
          assert.equal(request.url.searchParams.get(queryKey), value, name);
        if (contract.idempotency)
          assert.equal(request.headers["idempotency-key"], "mcp-contract-key", name);
      }
      for (const uri of [
        "actorconsole://workspace",
        "actorconsole://actors",
        "actorconsole://notifications",
        "actorconsole://publishing/schedules",
        "actorconsole://actors/owner%2Fname",
      ]) {
        await client.readResource({ uri });
      }
      assert.equal(
        requests.at(-1).url.pathname,
        "/actors/owner%2Fname",
        "Actor resource was double-encoded",
      );
      await client.getPrompt({
        name: "optimize_actor_listing",
        arguments: { apifyActorId: "owner~actor" },
      });
    } finally {
      await client.close();
    }
  }

  const probe = createServer();
  const httpPort = await listen(probe);
  await new Promise((resolveClose) => probe.close(resolveClose));
  const child = spawn(process.execPath, [bin, "--http"], {
    cwd: fixtureDir,
    env: {
      ...baseEnv,
      NODE_ENV: "test",
      ACTORCONSOLE_API_KEY: "",
      MCP_PORT: String(httpPort),
      MCP_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  let httpStdout = "";
  child.stdout.on("data", (chunk) => {
    httpStdout += chunk;
  });
  child.stderr.resume();
  const httpUrl = `http://127.0.0.1:${httpPort}`;
  await waitForHealth(`${httpUrl}/health`, child);
  const httpClient = new Client({ name: "packed-http-smoke", version: "1.0.0" });
  try {
    await httpClient.connect(
      new StreamableHTTPClientTransport(new URL(`${httpUrl}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${key}` } },
      }),
    );
    assert.equal((await httpClient.listTools()).tools.length, Object.keys(toolCases).length);
    assert(!(await httpClient.callTool({ name: "get_workspace", arguments: {} })).isError);
  } finally {
    await httpClient.close();
  }
  const revokedResponse = await fetch(`${httpUrl}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${revoked}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(revokedResponse.status, 401);
  assert.equal(httpStdout, "", "HTTP diagnostics were written to stdout");
  const revokedClient = new Client({ name: "revoked-stdio", version: "1.0.0" });
  try {
    await assert.rejects(
      revokedClient.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [bin],
          cwd: fixtureDir,
          env: { ...baseEnv, ACTORCONSOLE_API_KEY: revoked },
          stderr: "pipe",
        }),
      ),
      /Credential revoked/,
    );
  } finally {
    await revokedClient.close();
  }
  process.stdout.write(
    `PASS: installed tarball; all ${Object.keys(toolCases).length} tools; resources/prompts; stdio/HTTP; revoked credentials; no private runtime packages.\nTarball: ${tarball}\n`,
  );
} finally {
  for (const child of children) child.kill();
  api.closeAllConnections();
  await new Promise((resolveClose) => api.close(resolveClose));
  // Only remove the unique temporary project created by this check.
  assert(
    dirname(fixtureDir) === resolve(tmpdir()) &&
      basename(fixtureDir).startsWith("actorconsole-mcp-smoke-"),
  );
  await rm(fixtureDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
