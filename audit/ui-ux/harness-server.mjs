import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import loadConfig from "tailwindcss/loadConfig.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, "../..");
const sourceRoot = process.env.UI_AUDIT_BASELINE ?? repo;
const server = await createServer({
  configFile: false,
  root,
  plugins: [react()],
  esbuild: { jsx: "automatic" },
  define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  resolve: { alias: [
    { find: "next/link", replacement: path.join(root, "next-link.tsx") },
    { find: "next/navigation", replacement: path.join(root, "navigation.ts") },
    { find: "@actorconsole/shared", replacement: path.join(repo, "packages/shared/src") },
    { find: "@", replacement: path.join(sourceRoot, "apps/web/src") },
  ] },
  css: { postcss: { plugins: [tailwindcss({
    ...loadConfig(path.join(repo, "apps/web/tailwind.config.ts")),
    content: [path.join(sourceRoot, "apps/web/src/**/*.{ts,tsx}"), path.join(root, "*.tsx")],
  })] } },
  server: { host: "127.0.0.1", port: Number(process.env.UI_AUDIT_PORT ?? 4188), strictPort: true, fs: { allow: [repo, sourceRoot] } },
});
await server.listen();
process.stdout.write(`Disposable UI harness: ${server.resolvedUrls.local[0]}harness.html\n`);
