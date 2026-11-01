import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";

function fix(dir) {
  for (const name of readdirSync(dir)) {
    const fp = join(dir, name);
    if (name === "node_modules") continue;
    // Docker build contexts intentionally omit local environment files. Skip
    // their workspace symlinks when the target is absent instead of failing
    // the entire production image build.
    if (!existsSync(fp)) continue;
    if (statSync(fp).isDirectory()) {
      fix(fp);
    } else if (name.endsWith(".js")) {
      const base = dirname(fp);
      const c = readFileSync(fp, "utf-8");
      const n = c.replace(
        /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(["'])(\.\.?\/[^"']+)\2/g,
        (match, prefix, quote, path) => {
          if (/\.(?:js|mjs|cjs|json|node|wasm)$/.test(path)) return match;
          if (existsSync(join(base, `${path}.js`))) return `${prefix}${quote}${path}.js${quote}`;
          if (existsSync(join(base, path, "index.js"))) return `${prefix}${quote}${path}/index.js${quote}`;
          return match;
        },
      );
      if (c !== n) writeFileSync(fp, n);
    }
  }
}

const requested = process.argv.slice(2);
const roots =
  requested.length > 0 ? requested.map((value) => resolve(value)) : ["/app/packages", "/app/apps"];
for (const root of roots) {
  if (existsSync(root)) fix(root);
}
