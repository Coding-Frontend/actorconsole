import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import { decodeIco, isIco } from "./ico";
import { requireWebsiteLogoR2 } from "./r2";
import { assertSafeLogoUrl, fetchLogoResource, readLimitedResponse } from "./safe-fetch";
export { assertSafeLogoUrl } from "./safe-fetch";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const FETCH_RETRIES = 2;
const LOGO_USER_AGENT =
  "Mozilla/5.0 (compatible; ActorConsoleLogoCatalog/1.0)";
const ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/ico",
  "image/icon",
  // Many servers send favicon.ico without an image type. The bytes are still
  // decoded and validated before anything is stored.
  "application/octet-stream",
]);

export type LogoSourceKind =
  "OFFICIAL_BRAND" | "WEB_MANIFEST" | "APPLE_TOUCH_ICON" | "FAVICON" | "ADMIN_UPLOAD" | "ADMIN_URL";

export const LOGO_SOURCE_PRIORITY: Readonly<Record<LogoSourceKind, number>> = {
  OFFICIAL_BRAND: 500,
  WEB_MANIFEST: 400,
  APPLE_TOUCH_ICON: 300,
  FAVICON: 200,
  ADMIN_UPLOAD: 100,
  ADMIN_URL: 100,
};

export function isAutomaticallyTrustedLogoSource(kind: LogoSourceKind) {
  return (
    kind === "OFFICIAL_BRAND" || kind === "WEB_MANIFEST" || kind === "APPLE_TOUCH_ICON"
  );
}

/** Raster sources smaller than this look blurry once scaled to 512 px. */
export const MIN_AUTO_TRUST_SOURCE_SIZE = 192;
/** Wider marks (wordmarks, banners) become a thin strip in a square thumbnail. */
export const MAX_AUTO_TRUST_ASPECT_RATIO = 2;

export type LogoSourceInfo = { width: number; height: number; vector: boolean };

/**
 * Whether a logo is good enough to approve without an admin looking at it.
 * Trusted sources that fail this still become candidates, but wait for review.
 */
export function meetsAutoTrustQuality(source: LogoSourceInfo) {
  const ratio = Math.max(source.width, source.height) / Math.max(1, Math.min(source.width, source.height));
  if (ratio > MAX_AUTO_TRUST_ASPECT_RATIO) return false;
  return source.vector || Math.min(source.width, source.height) >= MIN_AUTO_TRUST_SOURCE_SIZE;
}

export type StoredLogo = {
  storagePath: string;
  checksum: string;
  contentType: "image/webp";
  width: number;
  height: number;
  byteSize: number;
};

export type NormalizedLogo = Omit<StoredLogo, "storagePath"> & {
  bytes: Buffer;
  source: LogoSourceInfo;
};

function logoStorageMode() {
  const mode = process.env.WEBSITE_LOGO_STORAGE_BACKEND?.trim() || "filesystem";
  if (mode !== "filesystem" && mode !== "r2" && mode !== "r2-mirror") {
    throw new Error("Unknown website logo storage backend");
  }
  return mode;
}

function logoStorageRoot() {
  return resolve(
    process.env.WEBSITE_LOGO_STORAGE_PATH?.trim() ||
      join(process.cwd(), ".data", "actorconsole-assets"),
  );
}

function assertLogoStoragePath(storagePath: string) {
  if (!isWebsiteLogoStoragePath(storagePath)) {
    throw new Error("Invalid website logo storage path");
  }
}

function absoluteLogoPath(storagePath: string) {
  assertLogoStoragePath(storagePath);
  const root = logoStorageRoot();
  const absolutePath = resolve(root, storagePath);
  if (!absolutePath.startsWith(`${root}${sep}`)) {
    throw new Error("Invalid website logo storage path");
  }
  return absolutePath;
}

/**
 * Verify storage once before an enrichment batch. A missing or unwritable
 * persistent volume should fail the run itself, not mark every website broken.
 */
export async function verifyWebsiteLogoStorage() {
  const mode = logoStorageMode();
  if (mode !== "r2") await verifyFilesystemStorage();
  if (mode === "filesystem") return { path: logoStorageRoot() };

  const r2 = requireWebsiteLogoR2();
  const key = `website-logos/.storage-probe-${randomUUID()}`;
  const probe = Buffer.from("actorconsole-logo-storage");
  await r2.put(key, probe, "application/octet-stream");
  try {
    const stored = await r2.read(key);
    if (!stored?.equals(probe)) throw new Error("R2 logo storage verification failed");
  } finally {
    await r2.remove(key);
  }
  return { bucket: r2.bucket };
}

async function verifyFilesystemStorage() {
  const root = logoStorageRoot();
  await mkdir(root, { recursive: true });
  const probePath = join(root, `.storage-probe-${randomUUID()}`);
  const probe = Buffer.from("actorconsole-logo-storage");
  try {
    await writeFile(probePath, probe, { flag: "wx", mode: 0o600 });
    const stored = await readFile(probePath);
    if (!stored.equals(probe)) throw new Error("Website logo storage verification failed");
  } finally {
    await unlink(probePath).catch(() => undefined);
  }
}

function externalRetryDelay(headers: Headers, attempt: number) {
  const retryAfter = headers.get("retry-after")?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(5_000, seconds * 1_000);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(5_000, Math.max(0, at - Date.now()));
  }
  return Math.min(5_000, 400 * 2 ** attempt);
}

async function fetchExternal(fetchImpl: typeof fetch | undefined, url: URL, headers: Record<string, string>) {
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
    const requestHeaders = {
      ...headers,
      "accept-language": "en-US,en;q=0.8",
      "user-agent": LOGO_USER_AGENT,
    };
    const signal = AbortSignal.timeout(15_000);
    let response: Response;
    if (fetchImpl) {
      // Explicit transport injection is used by disposable tests only.
      await assertSafeLogoUrl(url, signal);
      response = await fetchImpl(url, { redirect: "manual", headers: requestHeaders, signal });
    } else {
      response = await fetchLogoResource(url, requestHeaders, signal);
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === FETCH_RETRIES) return response;
    await response.body?.cancel().catch(() => undefined);
    await new Promise((resolve) =>
      setTimeout(resolve, externalRetryDelay(response.headers, attempt)),
    );
  }
  throw new Error("Website logo request exhausted its retry policy");
}

export async function downloadLogoSource(rawUrl: string, fetchImpl?: typeof fetch) {
  let url = new URL(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetchExternal(fetchImpl, url, {
      accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new Error("Logo redirect did not include a location");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Logo source returned HTTP ${response.status}`);
    }
    const bytes = await readLimitedResponse(response, MAX_SOURCE_BYTES, "Logo source exceeds 5 MB");
    if (!bytes.length || bytes.length > MAX_SOURCE_BYTES)
      throw new Error("Logo source exceeds 5 MB");
    const contentType =
      response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (contentType && !ACCEPTED_TYPES.has(contentType))
      throw new Error("Logo source is not a supported image");
    return { bytes, contentType, finalUrl: url.toString() };
  }
  throw new Error("Logo source exceeded the redirect limit");
}

/**
 * Reject SVG features that could reach the network or run code. Local
 * references such as `fill="url(#gradient)"` and embedded raster images are
 * common in brand marks and are safe to rasterize.
 */
export function assertSafeSvg(text: string) {
  const unsafe = () => new Error("Unsafe SVG content was rejected");
  if (/<!doctype|<!entity|<script|<foreignobject|@import|\bon[a-z]+\s*=/i.test(text)) throw unsafe();
  for (const match of text.matchAll(/(?:href|xlink:href)\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    const value = (match[2] ?? "").trim().toLowerCase();
    if (value.startsWith("#")) continue;
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]*$/.test(value)) continue;
    throw unsafe();
  }
  for (const match of text.matchAll(/url\s*\(\s*(["']?)([^)]*?)\1\s*\)/gi)) {
    if (!(match[2] ?? "").trim().startsWith("#")) throw unsafe();
  }
}

export async function normalizeWebsiteLogo(bytes: Buffer): Promise<NormalizedLogo> {
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw new Error("Logo source exceeds 5 MB");
  let image: ReturnType<typeof sharp>;
  let source: LogoSourceInfo;
  if (isIco(bytes)) {
    const decoded = decodeIco(bytes);
    image =
      decoded.kind === "png"
        ? sharp(decoded.bytes, { failOn: "error", limitInputPixels: 16_777_216 })
        : sharp(decoded.pixels, {
            raw: { width: decoded.width, height: decoded.height, channels: 4 },
          });
    source = { width: decoded.width, height: decoded.height, vector: false };
  } else {
    const sourceText = bytes.toString("utf8").toLowerCase();
    const vector = sourceText.includes("<svg");
    if (vector) assertSafeSvg(sourceText);
    // Animated GIF/WebP sources use their first frame (sharp's default).
    image = sharp(bytes, { failOn: "error", limitInputPixels: 16_777_216 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height)
      throw new Error("Logo dimensions could not be determined");
    const rotated = (metadata.orientation ?? 1) >= 5;
    source = {
      width: rotated ? metadata.height : metadata.width,
      height: rotated ? metadata.width : metadata.height,
      vector: vector || metadata.format === "svg",
    };
  }
  const normalized = await image
    .rotate()
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    })
    .webp({ quality: 92, alphaQuality: 100 })
    .toBuffer();
  return {
    bytes: normalized,
    checksum: createHash("sha256").update(normalized).digest("hex"),
    contentType: "image/webp",
    width: 512,
    height: 512,
    byteSize: normalized.byteLength,
    source,
  };
}

export async function storeWebsiteLogo(
  websiteIdentityId: string,
  source: Buffer,
): Promise<StoredLogo> {
  return storeNormalizedWebsiteLogo(websiteIdentityId, await normalizeWebsiteLogo(source));
}

/** Store a logo that was already normalized, e.g. while choosing a candidate. */
export async function storeNormalizedWebsiteLogo(
  websiteIdentityId: string,
  normalized: NormalizedLogo,
): Promise<StoredLogo> {
  const storagePath = websiteLogoStoragePath(websiteIdentityId, normalized.checksum);
  const mode = logoStorageMode();
  const r2 = mode === "filesystem" ? null : requireWebsiteLogoR2();
  if (mode !== "r2") await writeFilesystemLogo(storagePath, normalized.bytes);
  if (r2) await r2.put(storagePath, normalized.bytes);
  const { bytes: _bytes, source: _source, ...result } = normalized;
  return { ...result, storagePath };
}

export function isWebsiteLogoStoragePath(storagePath: string) {
  return /^website-logos\/[a-zA-Z0-9_-]+\/[a-f0-9]{64}\.webp$/.test(storagePath);
}

/** Every stored logo object in the active backend(s), for orphan cleanup. */
export async function* listStoredWebsiteLogos(): AsyncGenerator<{
  storagePath: string;
  lastModified: Date;
}> {
  const mode = logoStorageMode();
  if (mode !== "filesystem") {
    for await (const object of requireWebsiteLogoR2().list("website-logos/")) {
      if (isWebsiteLogoStoragePath(object.key)) {
        yield { storagePath: object.key, lastModified: object.lastModified };
      }
    }
    return;
  }
  const root = logoStorageRoot();
  const base = join(root, "website-logos");
  let websites: string[];
  try {
    websites = await readdir(base);
  } catch {
    return;
  }
  for (const website of websites) {
    let files: string[];
    try {
      files = await readdir(join(base, website));
    } catch {
      continue;
    }
    for (const file of files) {
      const storagePath = relative(root, join(base, website, file)).split(sep).join("/");
      if (!isWebsiteLogoStoragePath(storagePath)) continue;
      const info = await stat(join(base, website, file));
      yield { storagePath, lastModified: info.mtime };
    }
  }
}

/** Remove a stored logo object from every backend that holds a copy. */
export async function deleteStoredWebsiteLogo(storagePath: string) {
  assertLogoStoragePath(storagePath);
  const mode = logoStorageMode();
  if (mode !== "filesystem") await requireWebsiteLogoR2().remove(storagePath);
  if (mode !== "r2") {
    await unlink(absoluteLogoPath(storagePath)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

async function writeFilesystemLogo(storagePath: string, bytes: Buffer) {
  const absolutePath = absoluteLogoPath(storagePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o644 });
    await rename(temporaryPath, absolutePath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export function websiteLogoStoragePath(websiteIdentityId: string, checksum: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(websiteIdentityId) || !/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error("Invalid website logo storage key");
  }
  return `website-logos/${websiteIdentityId}/${checksum}.webp`;
}

export async function readWebsiteLogo(storagePath: string): Promise<Buffer> {
  assertLogoStoragePath(storagePath);
  const mode = logoStorageMode();
  if (mode !== "filesystem") {
    const bytes = await requireWebsiteLogoR2().read(storagePath);
    if (bytes) return bytes;
    if (mode === "r2") throw new Error("Website logo is missing from R2");
  }
  return readFile(absoluteLogoPath(storagePath));
}

/** Compare an R2 object with its database record, optionally copying it from disk first. */
export async function verifyWebsiteLogoInR2(
  logo: Pick<StoredLogo, "storagePath" | "checksum" | "byteSize">,
  copyMissing = false,
) {
  const { storagePath, checksum, byteSize } = logo;
  assertLogoStoragePath(storagePath);
  if (!storagePath.endsWith(`/${checksum}.webp`)) {
    throw new Error("Website logo key does not match its database checksum");
  }
  const matches = (bytes: Buffer | null) =>
    bytes?.length === byteSize && createHash("sha256").update(bytes).digest("hex") === checksum;
  const r2 = requireWebsiteLogoR2();
  let remote = await r2.read(storagePath);
  if (!remote && copyMissing) {
    const local = await readFile(absoluteLogoPath(storagePath));
    if (!matches(local)) throw new Error("VPS logo does not match its database checksum");
    await r2.put(storagePath, local);
    remote = await r2.read(storagePath);
  }
  if (!matches(remote)) throw new Error("R2 logo is missing or does not match its database checksum");
}

type IconCandidate = { url: string; kind: LogoSourceKind; score: number };

function candidateScore(kind: LogoSourceKind, size = 0, bonus = 0) {
  return LOGO_SOURCE_PRIORITY[kind] * 1_000 + Math.min(Math.max(size, 0), 512) + bonus;
}

function resolveCandidateUrl(value: string | undefined, pageUrl: string) {
  if (!value) return null;
  try {
    return new URL(value.replaceAll("&amp;", "&"), pageUrl).toString();
  } catch {
    return null;
  }
}

function logoValueFromJsonLd(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(logoValueFromJsonLd);
  const record = value as Record<string, unknown>;
  return [record.url, record.contentUrl, record.logo].flatMap(logoValueFromJsonLd);
}

/**
 * Read only explicit logo metadata from the official page. In particular,
 * `og:image` is intentionally ignored because it is commonly a hero or social
 * card rather than a reusable brand mark.
 */
export function officialLogoCandidatesFromHtml(html: string, pageUrl: string): IconCandidate[] {
  const candidates: IconCandidate[] = [];
  const add = (value: string | undefined, bonus = 0) => {
    const url = resolveCandidateUrl(value, pageUrl);
    if (url) {
      candidates.push({
        url,
        kind: "OFFICIAL_BRAND",
        score: candidateScore("OFFICIAL_BRAND", 0, bonus),
      });
    }
  };

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = /\brel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    if (rel.split(/\s+/).includes("logo")) add(/\bhref=["']([^"']+)["']/i.exec(tag)?.[1], 30);
  }
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const itemProp = /\bitemprop=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const property = /\bproperty=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (itemProp === "logo" || property === "og:logo") {
      add(/\bcontent=["']([^"']+)["']/i.exec(tag)?.[1], 20);
    }
  }
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(match[1] ?? "null") as unknown;
      const nodes: unknown[] = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { "@graph"?: unknown[] })["@graph"])
          ? ((parsed as { "@graph": unknown[] })["@graph"] ?? [])
          : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const record = node as Record<string, unknown>;
        for (const value of logoValueFromJsonLd(record.logo)) add(value, 40);
      }
    } catch {
      // Invalid structured data must not prevent icon fallbacks.
    }
  }

  return [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].sort(
    (left, right) => right.score - left.score,
  );
}

export function iconCandidatesFromHtml(html: string, pageUrl: string): IconCandidate[] {
  const candidates: IconCandidate[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = /\brel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    let kind: LogoSourceKind | null = null;
    let score = 0;
    if (rel.includes("apple-touch-icon")) {
      kind = "APPLE_TOUCH_ICON";
      score = candidateScore(kind);
    } else if (rel.split(/\s+/).includes("icon") || rel.includes("shortcut icon")) {
      kind = "FAVICON";
      score = candidateScore(kind);
    }
    if (!kind) continue;
    const sizes = /\bsizes=["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    const size = Math.max(
      ...[...sizes.matchAll(/(\d+)x(\d+)/g)].map((value) => Number(value[1])),
      0,
    );
    candidates.push({
      url: new URL(href, pageUrl).toString(),
      kind,
      score: score + Math.min(size, 512),
    });
  }
  candidates.push({
    url: new URL("/favicon.ico", pageUrl).toString(),
    kind: "FAVICON",
    score: candidateScore("FAVICON"),
  });
  return candidates.sort((left, right) => right.score - left.score);
}

async function fetchSafeText(rawUrl: string, fetchImpl: typeof fetch | undefined, accept: string) {
  let url = new URL(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetchExternal(fetchImpl, url, { accept });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new Error("Website redirect did not include a location");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Official website returned HTTP ${response.status}`);
    }
    const bytes = await readLimitedResponse(response, 1_000_000, "Official website response is too large");
    return { text: new TextDecoder().decode(bytes), finalUrl: url.toString() };
  }
  throw new Error("Official website exceeded the redirect limit");
}

function manifestUrlsFromHtml(html: string, pageUrl: string) {
  return [...html.matchAll(/<link\b[^>]*>/gi)].flatMap((match) => {
    const tag = match[0];
    const rel = /\brel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
    return rel.split(/\s+/).includes("manifest") && href ? [new URL(href, pageUrl).toString()] : [];
  });
}

export async function discoverOfficialLogo(domain: string, fetchImpl?: typeof fetch) {
  const pageUrl = new URL(`https://${domain}`);
  const page = await fetchSafeText(
    pageUrl.toString(),
    fetchImpl,
    "text/html,application/xhtml+xml",
  );
  const candidates: IconCandidate[] = [];
  candidates.push(...officialLogoCandidatesFromHtml(page.text, page.finalUrl));
  for (const manifestUrl of manifestUrlsFromHtml(page.text, page.finalUrl)) {
    try {
      const manifest = await fetchSafeText(
        manifestUrl,
        fetchImpl,
        "application/manifest+json,application/json",
      );
      const parsed = JSON.parse(manifest.text) as {
        icons?: Array<{ src?: string; sizes?: string; purpose?: string }>;
      };
      for (const icon of parsed.icons ?? []) {
        if (!icon.src) continue;
        const size = Math.max(
          ...[...(icon.sizes ?? "").matchAll(/(\d+)x(\d+)/g)].map((value) => Number(value[1])),
          0,
        );
        candidates.push({
          url: new URL(icon.src, manifest.finalUrl).toString(),
          kind: "WEB_MANIFEST",
          score: candidateScore(
            "WEB_MANIFEST",
            size,
            icon.purpose?.includes("maskable") ? 5 : 0,
          ),
        });
      }
    } catch {
      // A malformed manifest does not prevent trying official page icons.
    }
  }
  candidates.push(...iconCandidatesFromHtml(page.text, page.finalUrl));
  candidates.sort((left, right) => right.score - left.score);
  const errors: string[] = [];
  type Found = Awaited<ReturnType<typeof downloadLogoSource>> & {
    sourceKind: LogoSourceKind;
    normalized: NormalizedLogo;
  };
  let fallback: Found | null = null;
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    // Once a trusted logo is in hand, lower-priority icons can't beat it.
    if (fallback && isAutomaticallyTrustedLogoSource(fallback.sourceKind) && !isAutomaticallyTrustedLogoSource(candidate.kind)) {
      break;
    }
    try {
      const downloaded = await downloadLogoSource(candidate.url, fetchImpl);
      // A successful response can still contain an unsupported or unsafe image.
      // Validate it before selecting the candidate so another icon can be tried.
      const normalized = await normalizeWebsiteLogo(downloaded.bytes);
      const found = { ...downloaded, sourceKind: candidate.kind, normalized };
      // Keep looking for a trusted source that is also sharp and square enough;
      // otherwise the best-ranked usable image is returned for admin review.
      if (!isAutomaticallyTrustedLogoSource(candidate.kind) || meetsAutoTrustQuality(normalized.source)) {
        return found;
      }
      fallback ??= found;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (fallback) return fallback;
  throw new Error(errors[0] ?? "Official website does not expose a usable logo");
}
