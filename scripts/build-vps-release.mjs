import { spawnSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}

const revision = process.env.REVISION;
if (!/^[0-9a-f]{40}$/.test(revision ?? "")) throw new Error("REVISION must be a full commit SHA");
const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
if (
  site.protocol !== "https:" ||
  site.origin !== process.env.NEXT_PUBLIC_SITE_URL ||
  site.username ||
  site.password
)
  throw new Error("NEXT_PUBLIC_SITE_URL must be your HTTPS origin");
for (const key of [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
])
  if (!process.env[key]) throw new Error(`${key} is required`);

const directory = ".cache/vps-release";
await mkdir(directory, { recursive: true });
const tags = [];
for (const service of ["api", "worker", "mcp", "web"]) {
  const tag = `actorconsole-vps-${service}:sha-${revision.slice(0, 12)}`;
  const args = [
    "build",
    "--target",
    service,
    "--tag",
    tag,
    "--label",
    `org.opencontainers.image.revision=${revision}`,
  ];
  if (service === "web") {
    args.push("--build-arg", "API_BASE_URL=http://127.0.0.1:4000");
    for (const key of [
      "NEXT_PUBLIC_API_URL",
      "NEXT_PUBLIC_API_BASE_URL",
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_APP_NAME",
      "NEXT_PUBLIC_CHROME_EXTENSION_URL",
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
    ])
      args.push("--build-arg", key);
  }
  run("docker", [...args, "."]);
  tags.push(tag);
}
run("git", ["archive", "--format=tar.gz", `--output=${directory}/source.tar.gz`, revision]);
const save = spawn("docker", ["image", "save", ...tags], { stdio: ["ignore", "pipe", "inherit"] });
const exit = new Promise((resolve, reject) => {
  save.on("error", reject);
  save.on("close", (code) =>
    code === 0 ? resolve() : reject(new Error(`docker save failed (${code})`)),
  );
});
await Promise.all([
  pipeline(save.stdout, createGzip({ level: 1 }), createWriteStream(`${directory}/images.tar.gz`)),
  exit,
]);
const sha256 = {};
for (const name of ["source.tar.gz", "images.tar.gz"]) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(`${directory}/${name}`)) hash.update(chunk);
  sha256[name] = hash.digest("hex");
}
await writeFile(`${directory}/manifest.json`, JSON.stringify({ revision, sha256 }));
run("tar", [
  "-cf",
  `${directory}/release.tar`,
  "-C",
  directory,
  "manifest.json",
  "source.tar.gz",
  "images.tar.gz",
]);
console.log(`Release bundle ready for ${revision}`);
