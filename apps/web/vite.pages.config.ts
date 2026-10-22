import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { parse } from "@babel/parser";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sitemap from "./src/app/sitemap";
import robots from "./src/app/robots";
import { staticPageMetadata } from "../../.deploy/pages/public-metadata.js";
const root = dirname(fileURLToPath(import.meta.url));

/** Compile data-loading view functions into cancellable browser components. API handlers are excluded. */
function clientViews(metadata: Map<string, unknown>): Plugin {
  const adapters: Record<string, string> = {
    auth: "auth.ts",
    "api-base": "api-base.ts",
    "backend-data": "backend-data.ts",
    "server-api": "server-api.ts",
    "admin/server-api": "admin-server-api.ts",
  };
  return {
    name: "actorconsole-client-views",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".")) return;
      const path = resolve(dirname(importer), source)
        .replaceAll("\\", "/")
        .replace(/\.(tsx?|js)$/, "");
      for (const [name, adapter] of Object.entries(adapters))
        if (path === resolve(root, `src/lib/${name}`).replaceAll("\\", "/"))
          return resolve(root, `src/static/${adapter}`);
    },
    transform(source, id) {
      if (!id.includes("/src/") || !id.endsWith(".tsx") || id.includes("/src/static/")) return;
      const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
      const pageMetadata = staticPageMetadata(ast.program, id);
      if (pageMetadata) metadata.set(pageMetadata.path, pageMetadata);
      const edits: Array<{ start: number; end: number; text: string }> = [];
      let count = 0;
      type AstNode = {
        type: string;
        start: number;
        end: number;
        async?: boolean;
        id?: { name: string };
        body?: unknown;
      };
      const isNode = (node: unknown): node is AstNode =>
        Boolean(
          node && typeof node === "object" && "type" in node && "start" in node && "end" in node,
        );
      const containsJsx = (node: unknown): boolean => {
        if (!node || typeof node !== "object") return false;
        if (isNode(node) && ["JSXElement", "JSXFragment"].includes(node.type)) return true;
        return Object.values(node).some((value) =>
          Array.isArray(value) ? value.some(containsJsx) : containsJsx(value),
        );
      };
      const visit = (node: unknown, parent?: AstNode) => {
        if (!isNode(node)) return;
        if (
          node.type === "FunctionDeclaration" &&
          node.id &&
          node.async &&
          /^[A-Z]/.test(node.id?.name ?? "") &&
          (parent?.type === "ExportDefaultDeclaration" || containsJsx(node.body))
        ) {
          const prefix =
            parent?.type === "ExportDefaultDeclaration"
              ? "export default "
              : parent?.type === "ExportNamedDeclaration"
                ? `export const ${node.id.name} = `
                : `const ${node.id.name} = `;
          edits.push({
            start: parent?.type?.startsWith("Export") ? parent.start : node.start,
            end: node.start,
            text: `${prefix}__clientView(`,
          });
          edits.push({
            start: node.end,
            end: node.end,
            text: id.endsWith("/layout.tsx") ? ", { layout: true });" : ");",
          });
          count++;
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach((child) => visit(child, node));
          else if (value && typeof value === "object") visit(value, node);
        }
      };
      visit(ast.program);
      if (!count) return;
      let code = source;
      for (const edit of edits.sort((left, right) => right.start - left.start))
        code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
      return {
        code: `import { withClientData as __clientView } from "@static/client-data";\n${code}`,
        map: null,
      };
    },
  };
}
export default defineConfig(({ mode }) => {
  const local = process.env.ACTORCONSOLE_PAGES_PREVIEW === "1";
  const output = resolve(root, local ? "dist-pages-preview" : "dist-pages");
  const metadata = new Map<string, unknown>();
  const env = { ...loadEnv(mode, root, "NEXT_PUBLIC_"), ...process.env };
  const definitions: Record<string, string> = {};
  const browserEnv: Record<string, string> = {
    NODE_ENV: mode === "development" ? "development" : "production",
  };
  for (const [key, value] of Object.entries(env))
    if (key.startsWith("NEXT_PUBLIC_")) {
      definitions[`process.env.${key}`] = JSON.stringify(value ?? "");
      browserEnv[key] = value ?? "";
    }
  const configuredApi = env.NEXT_PUBLIC_API_BASE_URL;
  definitions["process.env.NEXT_PUBLIC_API_BASE_URL"] = JSON.stringify(
    configuredApi?.startsWith("https://") || (local && configuredApi === "http://127.0.0.1:8089")
      ? configuredApi
      : "http://localhost:4000",
  );
  definitions["process.env.NODE_ENV"] = JSON.stringify(
    mode === "development" ? "development" : "production",
  );
  definitions["process.env"] = JSON.stringify(browserEnv);
  const alias = (name: string, file: string) => ({
    find: name,
    replacement: resolve(root, `src/static/${file}`),
  });
  return {
    root,
    publicDir: resolve(root, "public"),
    define: definitions,
    resolve: {
      alias: [
        alias("@/lib/api-base", "api-base.ts"),
        alias("@/lib/auth", "auth.ts"),
        alias("@/lib/backend-data", "backend-data.ts"),
        alias("@/lib/server-api", "server-api.ts"),
        alias("@/lib/admin/server-api", "admin-server-api.ts"),
        alias("next/navigation", "navigation.tsx"),
        alias("next/link", "link.tsx"),
        alias("next/image", "image.tsx"),
        alias("next/dynamic", "dynamic.tsx"),
        alias("next/headers", "headers.ts"),
        alias("server-only", "empty.ts"),
        { find: /^@actorconsole\/shared$/, replacement: resolve(root, "src/static/shared.ts") },
        { find: "@static", replacement: resolve(root, "src/static") },
        { find: "@", replacement: resolve(root, "src") },
      ],
      dedupe: ["react", "react-dom"],
    },
    plugins: [
      clientViews(metadata),
      react(),
      {
        name: "pages-static-assets",
        closeBundle() {
          writeFileSync(
            resolve(output, "public-metadata.json"),
            JSON.stringify([...metadata.values()]),
          );
          writeFileSync(
            resolve(output, "_headers"),
            "/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n",
          );
          writeFileSync(
            resolve(output, "_redirects"),
            `/changelog/feed ${configuredApi?.startsWith("http") ? configuredApi : "http://localhost:4000"}/changelog/rss 302\n`,
          );
          const escape = (value: string) =>
            value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
          writeFileSync(
            resolve(output, "sitemap.xml"),
            `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemap()
              .map(
                (item) =>
                  `<url><loc>${escape(item.url)}</loc><changefreq>${item.changeFrequency}</changefreq><priority>${item.priority}</priority></url>`,
              )
              .join("")}</urlset>`,
          );
          const policy = robots();
          const rules = Array.isArray(policy.rules) ? policy.rules : [policy.rules];
          writeFileSync(
            resolve(output, "robots.txt"),
            `${rules.map((rule) => `User-agent: ${rule.userAgent}\nAllow: ${rule.allow}\n${(Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow]).map((path) => `Disallow: ${path}`).join("\n")}`).join("\n")}\nSitemap: ${policy.sitemap}\n`,
          );
        },
      },
    ],
    server: { host: "127.0.0.1", port: 8088, fs: { allow: [resolve(root, "../..")] } },
    esbuild: { jsxDev: false },
    build: { outDir: output, emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 1500 },
  };
});
