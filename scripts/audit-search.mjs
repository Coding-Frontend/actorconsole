/** Read-only crawl of the public sitemap and initial HTML. No browser/login required.
 * node scripts/audit-search.mjs [origin] [report.json] [canonical-origin]
 * For local verification: ... http://localhost:8091 .cache/seo/local.json https://actorconsole.com
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const origin = new URL(process.argv[2] || "https://actorconsole.com").origin;
const canonicalOrigin = new URL(process.argv[4] || origin).origin;
const output = process.argv[3] || ".cache/seo/search-audit.json";
const failures = [];
const warnings = [];
const images = new Set();
const pages = [];
const timeout = () => AbortSignal.timeout(20_000);
const decode = (text) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
const textOnly = (html) =>
  decode(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
const tags = (html, tag) =>
  [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))].map(([tag]) =>
    Object.fromEntries(
      [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(([, key, a, b]) => [
        key.toLowerCase(),
        decode(a ?? b),
      ]),
    ),
  );
const normalized = (url) => new URL(url).href.replace(/\/$/, "");

async function checkPage(canonicalUrl) {
  const path = new URL(canonicalUrl).pathname;
  try {
    const response = await fetch(new URL(path, origin), { signal: timeout() });
    const html = await response.text();
    const head = html.split(/<\/head>/i)[0];
    const meta = tags(head, "meta");
    const value = (key) => meta.find((tag) => tag.name === key || tag.property === key)?.content;
    const canonicals = tags(head, "link").filter((tag) => tag.rel === "canonical");
    const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(([, text]) =>
      textOnly(text),
    );
    const title = textOnly(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    const structuredData = [];
    for (const [, data] of html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
    )) {
      try {
        structuredData.push(JSON.parse(data));
      } catch {
        failures.push(`${path}: invalid JSON-LD`);
      }
    }
    if (response.status !== 200) failures.push(`${path}: HTTP ${response.status}`);
    if (new URL(response.url).pathname !== path)
      failures.push(`${path}: sitemap URL redirects to ${response.url}`);
    if (!title || !value("description"))
      failures.push(`${path}: missing title or description in the initial head`);
    if (canonicals.length !== 1 || normalized(canonicals[0].href) !== normalized(canonicalUrl))
      failures.push(`${path}: canonical does not match the sitemap URL`);
    if (h1s.length !== 1 || !h1s[0])
      failures.push(`${path}: expected one non-empty H1, found ${h1s.length}`);
    if (
      [value("robots"), value("googlebot"), response.headers.get("x-robots-tag")].some((value) =>
        /noindex|^none$/i.test(value || ""),
      )
    )
      failures.push(`${path}: sitemap page is marked noindex`);
    if (
      !value("og:title") ||
      !value("og:description") ||
      !value("og:image") ||
      value("twitter:card") !== "summary_large_image"
    )
      failures.push(`${path}: incomplete social sharing metadata`);
    if (value("og:url") && normalized(value("og:url")) !== normalized(canonicalUrl))
      failures.push(`${path}: Open Graph URL differs from the canonical`);
    // React can stream an article after its layout's closing main tag. Inspect
    // all server text for content notices rather than only the first landmark.
    const mainSections = [...html.matchAll(/<main\b[^>]*>([\s\S]*?)<\/main>/gi)];
    const serverText = textOnly(html);
    if (mainSections.length === 0) failures.push(`${path}: no main landmark in server HTML`);
    if (
      /No FAQs published|No notes in this category yet|No updates published yet/i.test(serverText)
    )
      warnings.push(`${path}: public content collection is empty`);
    if (/temporarily unavailable/i.test(serverText))
      warnings.push(`${path}: initial HTML reports unavailable content`);
    if (value("og:image")) images.add(value("og:image"));
    pages.push({
      path,
      status: response.status,
      title,
      canonical: canonicals[0]?.href,
      h1: h1s[0],
      description: value("description"),
      structuredTypes: structuredData
        .flatMap((data) => data["@graph"] || [data])
        .map((data) => data["@type"]),
      serverTextCharacters: serverText.length,
    });
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
  }
}

const sitemap = await fetch(`${origin}/sitemap.xml`, { signal: timeout() });
if (!sitemap.ok) throw new Error(`Sitemap returned ${sitemap.status}`);
const xml = await sitemap.text();
const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => decode(url));
if (!/<urlset\b/.test(xml) || urls.length === 0 || urls.length > 50_000)
  throw new Error("Expected a non-empty sitemap URL set with at most 50,000 URLs");
if (new Set(urls.map(normalized)).size !== urls.length)
  failures.push("Sitemap contains duplicate URLs");
if (urls.some((url) => new URL(url).origin !== canonicalOrigin))
  throw new Error("Sitemap includes URLs outside the expected canonical origin");
if (urls.some((url) => /^\/(dashboard|admin|api|login|signup)(\/|$)/.test(new URL(url).pathname)))
  failures.push("Sitemap includes an account or private URL");
for (let index = 0; index < urls.length; index += 4)
  await Promise.all(urls.slice(index, index + 4).map(checkPage));

const robotsResponse = await fetch(`${origin}/robots.txt`, { signal: timeout() });
const robots = await robotsResponse.text();
if (!robotsResponse.ok || !robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`))
  failures.push("robots.txt does not advertise the canonical sitemap");
if (!/User-Agent:\s*\*[\s\S]*?Allow:\s*\//i.test(robots))
  warnings.push("Review general crawler access in robots.txt");
for (const image of images) {
  const imageUrl = new URL(image);
  if (imageUrl.origin !== canonicalOrigin) continue;
  try {
    const response = await fetch(new URL(imageUrl.pathname, origin), {
      method: "HEAD",
      signal: timeout(),
    });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/"))
      failures.push(`Sharing image unavailable: ${imageUrl.pathname}`);
  } catch (error) {
    failures.push(`Sharing image ${imageUrl.pathname}: ${error.message}`);
  }
}
for (const path of ["/login", "/signup"]) {
  const response = await fetch(new URL(path, origin), { signal: timeout() });
  const html = await response.text();
  if (!tags(html, "meta").some((tag) => tag.name === "robots" && /noindex/.test(tag.content || "")))
    failures.push(`${path}: account page lacks noindex`);
}

const byTitle = new Map();
for (const page of pages) {
  const existing = byTitle.get(page.title);
  if (existing) warnings.push(`Duplicate title: ${existing} and ${page.path}`);
  byTitle.set(page.title, page.path);
}
const report = {
  checkedAt: new Date().toISOString(),
  origin,
  canonicalOrigin,
  pageCount: pages.length,
  imageCount: images.size,
  failures,
  warnings,
  pages: pages.sort((a, b) => a.path.localeCompare(b.path)),
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    { pageCount: report.pageCount, imageCount: images.size, failures, warnings, report: output },
    null,
    2,
  ),
);
process.exitCode = failures.length ? 1 : 0;
