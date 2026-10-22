import { zipSync } from "fflate";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(packageRoot, "dist");
const output = join(distDir, "actorconsole-chrome-extension.zip");

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = {};
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (absolute === output) continue;
    if (entry.isDirectory()) Object.assign(files, await filesUnder(absolute));
    else files[relative(distDir, absolute).replaceAll("\\", "/")] = new Uint8Array(await readFile(absolute));
  }
  return files;
}

await writeFile(output, zipSync(await filesUnder(distDir), { level: 9 }));
