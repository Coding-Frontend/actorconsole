import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MAX_BUILDS = 10;
const assetPattern = /^assets\/[\w.-]+\.(?:js|css|woff2?|png|jpe?g|svg|webp|gif)$/;
export function assetReferences(source) {
  const references = [
    ...source.matchAll(
      /["'`]((?:\.\/|\/)?(?:assets\/)?[\w.-]+\.(?:js|css|woff2?|png|jpe?g|svg|webp|gif))["'`]/g,
    ),
  ].map((match) => match[1].replace(/^(?:\.\/|\/)?(?:assets\/)?/, ""));
  for (const match of source.matchAll(
    /url\(["']?(?:\.\/|\/)?(?:assets\/)?([\w.-]+\.(?:woff2?|png|jpe?g|svg|webp|gif))["']?\)/g,
  ))
    references.push(match[1]);
  return [
    ...new Set(
      references.filter((file) => /-[\w-]{6,}\.[\w]+$/.test(file)).map((file) => `assets/${file}`),
    ),
  ];
}
function sourceOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !/^(?:[a-z0-9-]+\.)?actorconsole\.pages\.dev$/.test(url.hostname)
  )
    throw new Error("Asset retention requires an ActorConsole Pages deployment URL");
  return url.origin;
}
async function download(origin, path, fetcher) {
  const response = await fetcher(`${origin}/${path}`, {
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Cannot retain ${path}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 25 * 1024 * 1024)
    throw new Error(`Invalid retained asset size: ${path}`);
  if (/\.(js|css)$/.test(path) && response.headers.get("content-type")?.includes("text/html"))
    throw new Error(`Cannot retain HTML returned for ${path}`);
  return bytes;
}
async function previousBuilds(origin, fetcher, content) {
  const response = await fetcher(`${origin}/deployment-assets.json`, {
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
    const manifest = await response.json();
    if (
      manifest.version !== 1 ||
      !Array.isArray(manifest.builds) ||
      manifest.builds.length > MAX_BUILDS
    )
      throw new Error("Invalid deployment asset manifest");
    for (const build of manifest.builds) {
      if (
        !/^[a-f0-9]{16}$/.test(build.id) ||
        !Array.isArray(build.assets) ||
        build.assets.length > 2_000 ||
        !build.assets.every((path) => typeof path === "string" && assetPattern.test(path))
      )
        throw new Error("Invalid retained build");
    }
    return manifest.builds;
  }
  // Bootstrap releases predating the manifest using the complete Vite dependency graph.
  const index = await download(origin, "index.html", fetcher);
  const assets = new Set();
  let queue = assetReferences(new TextDecoder().decode(index));
  while (queue.length) {
    const batch = queue.splice(0, 8).filter((path) => !assets.has(path));
    const results = await Promise.all(
      batch.map(async (path) => {
        assets.add(path);
        const bytes = await download(origin, path, fetcher);
        content.set(`${origin}/${path}`, bytes);
        return /\.(js|css)$/.test(path) ? assetReferences(new TextDecoder().decode(bytes)) : [];
      }),
    );
    for (const refs of results) for (const path of refs) if (!assets.has(path)) queue.push(path);
    if (assets.size > 2_000) throw new Error("A retained build exceeds the asset budget");
  }
  if (!assets.size) throw new Error("No previous release assets found");
  return [
    {
      id: createHash("sha256").update(index).digest("hex").slice(0, 16),
      assets: [...assets].sort(),
    },
  ];
}

/** Retain immutable assets only; never import prior HTML, Functions or settings. */
export async function retainPagesAssets(output, sources, fetcher = fetch) {
  const current = {
    id: createHash("sha256")
      .update(readFileSync(join(output, "index.html")))
      .digest("hex")
      .slice(0, 16),
    assets: readdirSync(join(output, "assets"))
      .map((file) => `assets/${file}`)
      .filter((path) => assetPattern.test(path))
      .sort(),
  };
  const builds = [current];
  const content = new Map();
  const origins = new Map();
  for (const source of sources) {
    const origin = sourceOrigin(source);
    for (const build of await previousBuilds(origin, fetcher, content)) {
      if (builds.length >= MAX_BUILDS) break;
      if (!builds.some((item) => item.id === build.id)) {
        builds.push(build);
        origins.set(build.id, origin);
      }
    }
  }
  const paths = new Map();
  for (const build of builds.slice(1))
    for (const path of build.assets) paths.set(path, origins.get(build.id));
  const missing = [...paths.entries()].filter(([path]) => !existsSync(join(output, path)));
  for (let offset = 0; offset < missing.length; offset += 8) {
    await Promise.all(
      missing.slice(offset, offset + 8).map(async ([path, origin]) => {
        const bytes = content.get(`${origin}/${path}`) ?? (await download(origin, path, fetcher));
        mkdirSync(join(output, "assets"), { recursive: true });
        writeFileSync(join(output, path), bytes);
      }),
    );
  }
  const manifest = { version: 1, builds };
  writeFileSync(join(output, "deployment-assets.json"), `${JSON.stringify(manifest)}\n`);
  return { builds: builds.length, retainedAssets: missing.length };
}
