import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const forbidden = ["@actorconsole/db", "@actorconsole/apify", "@actorconsole/ai", "@prisma/client", "next-auth", "@auth/prisma-adapter"];
const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)]);
const errors = [];
for (const file of files(resolve(root, "apps/web/src"))) {
  if (!/\.(ts|tsx)$/.test(file) || /\.(test|spec)\./.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const dependency of forbidden) if ([`"${dependency}"`, `'${dependency}'`, `"${dependency}/`, `'${dependency}/`].some((name) => text.includes(name)))
    errors.push(`${file}: forbidden backend dependency ${dependency}`);
  if (/process\.env\.(DATABASE_URL|REDIS_URL|APP_ENCRYPTION_KEY|ADMIN_API_KEY|AUTH_SECRET|AUTH_URL|AUTH_TRUST_HOST|FIREBASE_SERVICE_ACCOUNT_KEY)\b/.test(text))
    errors.push(`${file}: backend secret in the web runtime`);
}
const web = JSON.parse(readFileSync(resolve(root, "apps/web/package.json"), "utf8"));
for (const dependency of forbidden) if (web.dependencies?.[dependency]) errors.push(`web/package.json: ${dependency}`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("Web boundary passed: no database client, Auth.js, backend SDK, or backend secrets.");
