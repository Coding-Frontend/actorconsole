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
      let c = readFileSync(fp, "utf-8");
      const n = c.replace(/from "(\.\.?\/[^"]+?)"/g, (m, p) => {
        if (p.endsWith(".js") || p.endsWith(".mjs")) return m;
        // p starts with './' or '../', strip the prefix to get a relative path
        const stripped = p.replace(/^\.?\//, "");
        const asFile = join(base, stripped + ".js");
        const asDir = join(base, stripped, "index.js");
        if (existsSync(asDir)) return `from "${p}/index.js"`;
        return `from "${p}.js"`;
      });
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
