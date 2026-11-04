import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../apps/web/", import.meta.url));
const require = createRequire(path.join(root, "package.json"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const tailwind = require("tailwindcss/loadConfig")(path.join(root, "tailwind.config.ts"));
const tsconfig = path.join(root, "test/fixtures/tsconfig.json");
const server = await createServer({
  configFile: false,
  root,
  tsconfig,
  optimizeDeps: { rolldownOptions: { tsconfig } },
  css: {
    postcss: {
      plugins: [
        require("tailwindcss")({
          ...tailwind,
          content: [path.join(root, "src/**/*.tsx"), path.join(root, "test/fixtures/*.tsx")],
        }),
        require("autoprefixer")(),
      ],
    },
  },
  resolve: { alias: { "@": path.join(root, "src") } },
  server: { host: "127.0.0.1", port: 8091, strictPort: true },
});
await server.listen();
server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
