import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const file = (path) => `${root}/${path}`;
const random = () => randomBytes(32).toString("hex");
function create(path, value) {
  if (existsSync(file(path))) {
    console.log(`Preserved existing ${path}`);
    return;
  }
  writeFileSync(file(path), value, { mode: 0o600, flag: "wx" });
  console.log(`Created ${path} (values withheld)`);
}

if (!existsSync(file(".env"))) {
  const password = random();
  let backend = readFileSync(file(".env.example"), "utf8");
  const values = {
    AUTH_SECRET: random(),
    ADMIN_API_KEY: random(),
    APP_ENCRYPTION_KEY: random(),
    MYSQL_APP_PASSWORD: password,
    MYSQL_ROOT_PASSWORD: random(),
    DATABASE_URL: `mysql://actorconsole:${password}@127.0.0.1:3306/actorconsole`,
  };
  for (const [key, value] of Object.entries(values))
    backend = backend.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
  create(".env", backend);
}
create("apps/worker/.env", readFileSync(file(".env"), "utf8"));
create("apps/web/.env.local", readFileSync(file(".env.web.example"), "utf8"));
create("apps/chrome-extension/.env.local", readFileSync(file(".env.extension.example"), "utf8"));
