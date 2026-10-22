import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, root, "NEXT_PUBLIC_"), ...process.env };
  const prerender = mode === "prerender";
  const alias = (name: string, file: string) => ({
    find: name,
    replacement: resolve(root, `src/edge/${file}`),
  });
  return {
    root,
    publicDir: false,
    esbuild: { jsxDev: false },
    plugins: [
      react(),
      {
        name: "public-view-boundary",
        enforce: "pre",
        resolveId(source, importer) {
          if (
            importer &&
            source.startsWith(".") &&
            resolve(dirname(importer), source)
              .replaceAll("\\", "/")
              .replace(/\.(ts|js)$/, "") ===
              resolve(root, "src/lib/backend-data").replaceAll("\\", "/")
          )
            return resolve(root, "src/edge/backend-data.ts");
        },
        generateBundle() {
          if (prerender) return;
          for (const id of this.getModuleIds()) {
            if (
              /node:|@prisma|packages[\\/]db[\\/]|packages[\\/]apify[\\/]|packages[\\/]ai[\\/]|next[\\/]dist[\\/]server/.test(
                id,
              )
            )
              this.error(`Backend dependency is forbidden in the public Worker: ${id}`);
          }
        },
      },
    ],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.NEXT_PUBLIC_API_BASE_URL": JSON.stringify(env.NEXT_PUBLIC_API_BASE_URL?.startsWith("http") ? env.NEXT_PUBLIC_API_BASE_URL : "http://localhost:4000"),
      "process.env.NEXT_PUBLIC_SITE_URL": JSON.stringify(env.NEXT_PUBLIC_SITE_URL || "http://localhost:8080"),
      "process.env.API_BASE_URL": JSON.stringify(env.NEXT_PUBLIC_API_BASE_URL?.startsWith("http") ? env.NEXT_PUBLIC_API_BASE_URL : "http://localhost:4000"),
      __PUBLIC_BUILD_ID__: JSON.stringify(
        prerender
          ? "build"
          : createHash("sha256")
              .update(readFileSync(resolve(root, "dist-pages/index.html")))
              .digest("hex")
              .slice(0, 16),
      ),
    },
    resolve: {
      // Browser export conditions can select DOM-only Markdown decoders.
      // Workers use Web APIs but have no document/window.
      conditions: ["workerd", "worker", "module", "production"],
      alias: [
        ...(prerender
          ? [{ find: "react-dom/server.browser", replacement: "react-dom/server.node" }]
          : []),
        alias("next/navigation", "navigation.tsx"),
        alias("next/link", "link.tsx"),
        alias("next/image", "image.tsx"),
        alias("@/lib/backend-data", "backend-data.ts"),
        // builders.ts uses a relative import. Match its resolved path as well.
        {
          find: resolve(root, "src/lib/backend-data.ts").replaceAll("\\", "/"),
          replacement: resolve(root, "src/edge/backend-data.ts"),
        },
        alias("@/components/marketing/schema-code-view", "schema-code-view.tsx"),
        alias("@/components/marketing/interactive-bar-chart", "chart.tsx"),
        { find: "@", replacement: resolve(root, "src") },
        { find: /^@actorconsole\/shared$/, replacement: resolve(root, "src/static/shared.ts") },
      ],
      dedupe: ["react", "react-dom"],
    },
    ssr: {
      noExternal: true,
      external: ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom/server.node"],
    },
    // Only browser-safe public view dependencies enter this bundle.
    build: {
      target: "es2022",
      ssr: prerender,
      outDir: prerender ? resolve(root, ".cache/pages-prerender") : resolve(root, "dist-pages"),
      emptyOutDir: prerender,
      minify: true,
      lib: {
        entry: resolve(root, `src/edge/${prerender ? "prerender.tsx" : "worker.ts"}`),
        formats: ["es"],
        fileName: () => (prerender ? "prerender.mjs" : "_worker.js"),
      },
      rollupOptions: {
        external: prerender
          ? ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom/server.node"]
          : [],
        output: {
          inlineDynamicImports: true,
          entryFileNames: prerender ? "prerender.mjs" : "_worker.js",
        },
        onwarn(warning, warn) {
          if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
        },
      },
    },
  };
});
