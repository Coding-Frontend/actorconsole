import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(packageRoot, "dist");
if (dirname(distDir) !== packageRoot) throw new Error("Refusing to clean an unexpected directory");
await rm(distDir, { recursive: true, force: true });
