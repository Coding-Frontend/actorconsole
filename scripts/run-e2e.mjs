import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { mkdir, open, access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startTestServices } from "../e2e/support/services.mjs";
import { prepareStandaloneWeb } from "../e2e/support/web-build.mjs";

const require = createRequire(import.meta.url);
const database = new URL(process.env.E2E_DATABASE_URL ?? "mysql://invalid/invalid");
if (
  database.protocol !== "mysql:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
  !/^\/actorconsole_e2e(?:_[a-z0-9_]+)?$/.test(database.pathname)
) {
  throw new Error(
    "Set E2E_DATABASE_URL to a dedicated loopback MySQL/MariaDB database named actorconsole_e2e (or actorconsole_e2e_*). Application databases are refused.",
  );
}
if (
  !process.env.E2E_REDIS_URL ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.E2E_REDIS_URL).hostname)
) {
  throw new Error(
    "Set E2E_REDIS_URL to a separate local Redis instance used only for these tests.",
  );
}
const webPort = Number(process.env.E2E_WEB_PORT ?? 8080);
const apiPort = Number(process.env.E2E_API_PORT ?? 4000);
async function assertPortAvailable(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("Invalid E2E service port");
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", () =>
      reject(
        new Error(
          `Port ${port} is already in use; choose an unused E2E_WEB_PORT/E2E_API_PORT. Existing applications will not be tested.`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
}
if (webPort === apiPort) throw new Error("E2E web and API ports must differ");
await Promise.all([assertPortAvailable(webPort), assertPortAvailable(apiPort)]);
const baseURL = `http://127.0.0.1:${webPort}`;
await access("apps/web/.next/BUILD_ID");
await access("apps/api/dist/index.js");
const services = await startTestServices();
const suffix = randomBytes(8).toString("hex");
const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: database.href,
  REDIS_URL: process.env.E2E_REDIS_URL,
  API_HOST: "127.0.0.1",
  API_PORT: String(apiPort),
  API_BASE_URL: `http://127.0.0.1:${apiPort}`,
  AUTH_URL: baseURL,
  WEB_BASE_URL: baseURL,
  NEXT_PUBLIC_SITE_URL: baseURL,
  CORS_ORIGINS: baseURL,
  AUTH_SECRET: randomBytes(32).toString("hex"),
  ADMIN_API_KEY: randomBytes(32).toString("hex"),
  APP_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  EMAIL_PROVIDER: "smtp",
  EMAIL_FROM_ADDRESS: "ActorConsole <e2e@example.test>",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: String(services.smtpPort),
  SMTP_SECURE: "false",
  SMTP_USERNAME: "",
  SMTP_PASSWORD: "",
  APIFY_API_BASE_URL: services.httpUrl,
  APIFY_API_TOKEN: "",
  SENTRY_DSN: "",
  OTEL_EXPORTER_OTLP_ENDPOINT: "",
  E2E_BASE_URL: baseURL,
  E2E_MAILBOX_URL: services.httpUrl,
  E2E_CONTENT_SUFFIX: suffix,
};
const children = [];
const handles = [];
await mkdir(".cache/e2e", { recursive: true });
function runNode(args, options = {}) {
  const child = spawn(process.execPath, args, { env, stdio: "inherit", ...options });
  children.push(child);
  return child;
}
async function complete(child) {
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0) throw new Error(`E2E process exited with code ${code}`);
}
async function server(name, args, options = {}) {
  const handle = await open(`.cache/e2e/${name}.log`, "w");
  handles.push(handle);
  return runNode(args, { stdio: ["ignore", handle.fd, handle.fd], ...options });
}
async function waitFor(url, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`E2E service exited; inspect .cache/e2e logs`);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2_000) })).ok) return;
    } catch {
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`E2E service did not become ready: ${url}`);
}
try {
  // Resolve tools from the package that owns them; this works with pnpm's strict layout.
  const prisma = require.resolve("prisma/build/index.js", { paths: [resolve("packages/db")] });
  await complete(runNode([prisma, "migrate", "deploy"], { cwd: resolve("packages/db") }));
  const seed = await server("seed", [
    "--input-type=module",
    "-e",
    `import { seedLaunchContent } from './e2e/support/seed.mjs'; await seedLaunchContent('${suffix}');`,
  ]);
  await complete(seed);
  const api = await server("api", ["apps/api/dist/index.js"]);
  await waitFor(`${env.API_BASE_URL}/health/ready`, api);
  const web = await server("web", [await prepareStandaloneWeb()], {
    env: { ...env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(webPort) },
  });
  await waitFor(`${baseURL}/api/health`, web);
  const playwright = require.resolve("@playwright/test/cli");
  await complete(runNode([playwright, "test", ...process.argv.slice(2)]));
} finally {
  await writeFile(".cache/e2e/upstream-requests.json", JSON.stringify(services.requests, null, 2));
  await Promise.all(
    children.reverse().map((child) => {
      if (child.exitCode !== null) return;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 5_000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill();
      });
    }),
  );
  await Promise.all(handles.map((handle) => handle.close()));
  await services.close();
}
