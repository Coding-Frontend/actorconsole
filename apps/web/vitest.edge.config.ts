import { defineConfig, mergeConfig } from "vitest/config";
import edgeConfig from "./vite.edge.config";

export default defineConfig(() =>
  mergeConfig(
    edgeConfig({ command: "serve", mode: "prerender", isSsrBuild: false, isPreview: false }),
    { test: { include: ["test/pages/public-render.edge.tsx"], environment: "node" } },
  ),
);
