import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const rehearsalDir = new URL("../.cache/d1-rehearsal/", import.meta.url);
const candidate = fileURLToPath(new URL("schema.prisma", rehearsalDir));
const ddlFile = fileURLToPath(new URL("schema.sql", rehearsalDir));
const dbRequire = createRequire(new URL("../packages/db/package.json", import.meta.url));
const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const stagingDatabase = "actorconsole-d1-staging";
const options = process.argv.slice(2);
if (options.length > 1 || (options.length && options[0] !== "--remote")) {
  throw new Error(
    "Run with no arguments to prepare SQL, or with --remote to rehearse in D1 staging",
  );
}

function run(entrypoint, args) {
  const result = spawnSync(process.execPath, [entrypoint, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
  });
  if (result.error) throw result.error;
  return result;
}

function prepareSchema() {
  const source = readFileSync(
    new URL("../packages/db/prisma/schema.prisma", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");
  assert.match(source, /provider\s*=\s*"mysql"/);
  const ticketNumberDefault = /^(\s*number\s+Int\s+@unique)\s+@default\(autoincrement\(\)\)$/m;
  assert.match(
    source,
    ticketNumberDefault,
    "Review ticket-number allocation before updating the rehearsal",
  );
  const sqlite = source
    .replace('provider = "mysql"', 'provider = "sqlite"')
    .replace('env("DATABASE_URL")', '"file:./rehearsal.db"')
    .replace(/[ \t]+@db\.\w+(?:\([^()]*\))?/g, "")
    .replace(ticketNumberDefault, "$1");

  mkdirSync(rehearsalDir, { recursive: true });
  writeFileSync(candidate, sqlite);
  const generated = run(dbRequire.resolve("prisma/build/index.js"), [
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    candidate,
    "--script",
  ]);
  if (generated.status !== 0)
    throw new Error(generated.stderr || "Could not generate SQLite schema");

  const ddl = generated.stdout
    .replaceAll("\r\n", "\n")
    .replace(
      /^(\s*"([^"]+)" JSONB(?: NOT NULL)?)(?: DEFAULT (.*?))?(,?)$/gm,
      (_, column, name, defaultValue, comma) => {
        const json = defaultValue === undefined ? null : JSON.stringify(JSON.parse(defaultValue));
        const sqlDefault = json === null ? "" : ` DEFAULT '${json.replaceAll("'", "''")}'`;
        return `${column}${sqlDefault} CHECK ("${name}" IS NULL OR json_valid("${name}"))${comma}`;
      },
    );
  const tables = [...ddl.matchAll(/^CREATE TABLE "([^"]+)"/gm)].map(([, name]) => name).sort();
  assert(tables.length > 0);
  writeFileSync(ddlFile, ddl);
  console.log(`Prepared ${tables.length} tables in ${ddlFile}`);
  return tables;
}

function rehearseRemote(expectedTables) {
  assert.match(
    process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    /^[a-f0-9]{32}$/i,
    "Set CLOUDFLARE_ACCOUNT_ID to the account that owns the dedicated staging database",
  );
  function execute(flags, expectedError) {
    const result = run(wrangler, [
      "d1",
      "execute",
      stagingDatabase,
      "--remote",
      "--json",
      ...flags,
    ]);
    if (expectedError) {
      assert.notEqual(result.status, 0, "Expected D1 to reject the statement");
      assert.match(result.stderr + result.stdout, expectedError);
      return [];
    }
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    return flags.includes("--file") ? [] : JSON.parse(result.stdout);
  }
  const query = (sql, expectedError) => execute(["--command", sql], expectedError);
  const tableNames = () =>
    query(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND substr(name, 1, 7) <> 'sqlite_' AND substr(name, 1, 4) <> '_cf_' ORDER BY name",
    )[0]
      .results.map(({ name }) => name)
      .sort();

  if (!tableNames().length) {
    execute(["--yes", "--file", ddlFile]);
  }
  assert.deepEqual(tableNames(), expectedTables);

  query(`
    INSERT INTO "User" (id, email, updatedAt)
      VALUES ('d1-fixture-user', 'd1-fixture@example.invalid', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO NOTHING;
    INSERT INTO "BusinessProfile" (id, userId, name, slug, updatedAt)
      VALUES ('d1-fixture-workspace', 'd1-fixture-user', 'D1 rehearsal', 'd1-fixture', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO NOTHING;
    INSERT INTO "Payment" (id, userId, businessProfileId, provider, providerPaymentId, amount, currency, status)
      VALUES ('d1-fixture-payment', 'd1-fixture-user', 'd1-fixture-workspace', 'razorpay', 'd1-fixture-provider-id', 1.234, 'KWD', 'CAPTURED')
      ON CONFLICT(id) DO NOTHING;
    INSERT INTO "BillingCheckoutOperation" (id, businessProfileId, userId, provider, billingMode, productId, interval, status, updatedAt)
      VALUES ('d1-fixture-checkout', 'd1-fixture-workspace', 'd1-fixture-user', 'razorpay', 'TEST', 'd1-fixture-product', 'MONTHLY', 'RESERVED', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO NOTHING;
    INSERT INTO "Ticket" (id, number, userId, businessProfileId, subject, category, updatedAt)
      VALUES ('d1-fixture-ticket', 101, 'd1-fixture-user', 'd1-fixture-workspace', 'Synthetic ticket', 'GENERAL', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO NOTHING;
    INSERT INTO "BackgroundJob" (id, queue, jobId, name, data, options, sortOrder, progress)
      VALUES ('d1-fixture-job', 'd1-fixture-queue', 'd1-fixture-queue-id', 'rehearsal', '{"actor":"fixture"}', '{}', 1, '0')
      ON CONFLICT(id) DO UPDATE SET state = 'waiting', leaseToken = NULL;
  `);
  const fixture = query(`
    SELECT u.email, json_type(u.totpRecoveryCodes) AS recoveryCodesType, p.amount, p.currency,
      b.status AS checkoutStatus, t.number AS ticketNumber, json_extract(j.data, '$.actor') AS jobActor
    FROM "User" u
    JOIN "BusinessProfile" w ON w.userId = u.id
    JOIN "Payment" p ON p.businessProfileId = w.id
    JOIN "BillingCheckoutOperation" b ON b.businessProfileId = w.id
    JOIN "Ticket" t ON t.businessProfileId = w.id
    JOIN "BackgroundJob" j ON j.id = 'd1-fixture-job'
    WHERE u.id = 'd1-fixture-user'
  `)[0].results;
  assert.deepEqual(fixture, [
    {
      email: "d1-fixture@example.invalid",
      recoveryCodesType: "array",
      amount: 1.234,
      currency: "KWD",
      checkoutStatus: "RESERVED",
      ticketNumber: 101,
      jobActor: "fixture",
    },
  ]);
  assert.deepEqual(query("PRAGMA foreign_key_check")[0].results, []);

  query(
    `INSERT INTO "Payment" (id, provider, providerPaymentId, amount, status)
    VALUES ('d1-fixture-duplicate-payment', 'razorpay', 'd1-fixture-provider-id', 1, 'CAPTURED')`,
    /UNIQUE constraint failed.*Payment/i,
  );
  query(
    `INSERT INTO "BusinessProfile" (id, userId, name, slug, updatedAt)
    VALUES ('d1-fixture-orphan', 'd1-fixture-missing-user', 'Invalid', 'invalid', CURRENT_TIMESTAMP)`,
    /FOREIGN KEY constraint failed/i,
  );
  query(
    `UPDATE "BackgroundJob" SET data = 'invalid JSON' WHERE id = 'd1-fixture-job'`,
    /CHECK constraint failed/i,
  );
  query(
    `INSERT INTO "Ticket" (id, userId, subject, category, updatedAt)
    VALUES ('d1-fixture-ticket-no-number', 'd1-fixture-user', 'Invalid', 'GENERAL', CURRENT_TIMESTAMP)`,
    /NOT NULL constraint failed.*Ticket\.number/i,
  );
  query(
    `SELECT id FROM "BusinessProfile" WHERE id = 'd1-fixture-workspace' FOR UPDATE`,
    /syntax error|SQLITE_ERROR/i,
  );

  const claim = `UPDATE "BackgroundJob" SET state = 'active', leaseToken = 'fixture'
    WHERE id = 'd1-fixture-job' AND state = 'waiting' RETURNING id`;
  assert.deepEqual(query(claim)[0].results, [{ id: "d1-fixture-job" }]);
  assert.deepEqual(query(claim)[0].results, []);
  console.log(`D1 staging passed for ${expectedTables.length} tables and six synthetic records.`);
  console.log("Verified payment uniqueness, foreign keys, JSON, and job claim retries.");
  console.log(
    "The existing FOR UPDATE query and implicit ticket numbering require application changes.",
  );
}

const expectedTables = prepareSchema();
if (options[0] === "--remote") rehearseRemote(expectedTables);
