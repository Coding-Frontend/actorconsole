import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import sharp from "sharp";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const FETCH_RETRIES = 2;
const LOGO_USER_AGENT =
  "Mozilla/5.0 (compatible; ActorConsoleLogoCatalog/1.0)";
const ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
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

export type StoredLogo = {
  storagePath: string;
  checksum: string;
  contentType: "image/webp";
  width: number;
  height: number;
  byteSize: number;
};

function logoStorageRoot() {
  return resolve(
    process.env.WEBSITE_LOGO_STORAGE_PATH?.trim() ||
      join(process.cwd(), ".data", "actorconsole-assets"),
  );
}

function absoluteLogoPath(storagePath: string) {
  if (!/^website-logos\/[a-zA-Z0-9_-]+\/[a-f0-9]{64}\.webp$/.test(storagePath)) {
    throw new Error("Invalid website logo storage path");
  }
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
  return { path: root };
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

async function fetchExternal(fetchImpl: typeof fetch, url: URL, headers: Record<string, string>) {
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
    const response = await fetchImpl(url, {
      redirect: "manual",
      headers: {
        ...headers,
        "accept-language": "en-US,en;q=0.8",
        "user-agent": LOGO_USER_AGENT,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === FETCH_RETRIES) return response;
    await response.body?.cancel().catch(() => undefined);
    await new Promise((resolve) =>
      setTimeout(resolve, externalRetryDelay(response.headers, attempt)),
    );
  }
  throw new Error("Website logo request exhausted its retry policy");
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.includes(":")) {
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mapped) return isPrivateAddress(mapped);
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("2001:db8:")
    );
  }
  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 0 && octets[2] === 2) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && octets[2] === 113)
  );
}

export async function assertSafeLogoUrl(url: URL) {
  if (url.protocol !== "https:") throw new Error("Logo sources must use HTTPS");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new Error("Local logo hosts are not allowed");
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Private network logo hosts are not allowed");
  }
}

export async function downloadLogoSource(rawUrl: string, fetchImpl: typeof fetch = fetch) {
  let url = new URL(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertSafeLogoUrl(url);
    const response = await fetchExternal(fetchImpl, url, {
      accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Logo redirect did not include a location");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`Logo source returned HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_SOURCE_BYTES) throw new Error("Logo source exceeds 5 MB");
    const bytes = Buffer.from(await response.arrayBuffer());
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

export async function normalizeWebsiteLogo(
  bytes: Buffer,
): Promise<Omit<StoredLogo, "storagePath"> & { bytes: Buffer }> {
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw new Error("Logo source exceeds 5 MB");
  const sourceText = bytes.toString("utf8").toLowerCase();
  if (
    sourceText.includes("<svg") &&
    /<!doctype|<!entity|<script|<foreignobject|(?:href|xlink:href)\s*=\s*["'](?:https?:|file:|data:)|url\s*\(/i.test(
      sourceText,
    )
  ) {
    throw new Error("Unsafe SVG content was rejected");
  }
  const image = sharp(bytes, { failOn: "error", limitInputPixels: 16_777_216 });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height)
    throw new Error("Logo dimensions could not be determined");
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
  };
}

export async function storeWebsiteLogo(
  websiteIdentityId: string,
  source: Buffer,
): Promise<StoredLogo> {
  const normalized = await normalizeWebsiteLogo(source);
  const storagePath = websiteLogoStoragePath(websiteIdentityId, normalized.checksum);
  const absolutePath = absoluteLogoPath(storagePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, normalized.bytes, { flag: "wx", mode: 0o644 });
    await rename(temporaryPath, absolutePath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
  const { bytes: _bytes, ...result } = normalized;
  return { ...result, storagePath };
}

export function websiteLogoStoragePath(websiteIdentityId: string, checksum: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(websiteIdentityId) || !/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error("Invalid website logo storage key");
  }
  return `website-logos/${websiteIdentityId}/${checksum}.webp`;
}

export async function readWebsiteLogo(storagePath: string): Promise<Buffer> {
  return readFile(absoluteLogoPath(storagePath));
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

async function fetchSafeText(rawUrl: string, fetchImpl: typeof fetch, accept: string) {
  let url = new URL(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertSafeLogoUrl(url);
    const response = await fetchExternal(fetchImpl, url, { accept });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Website redirect did not include a location");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`Official website returned HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > 1_000_000) throw new Error("Official website response is too large");
    return { text: (await response.text()).slice(0, 1_000_000), finalUrl: url.toString() };
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

export async function discoverOfficialLogo(domain: string, fetchImpl: typeof fetch = fetch) {
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
  for (const candidate of candidates) {
    try {
      const downloaded = await downloadLogoSource(candidate.url, fetchImpl);
      return { ...downloaded, sourceKind: candidate.kind };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(errors[0] ?? "Official website does not expose a usable logo");
}
