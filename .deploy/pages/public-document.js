import { PUBLIC_SITE } from "./public-config.js";
export { PUBLIC_SITE };

export function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}
export function pageTitle(title) {
  const value =
    typeof title === "string"
      ? title
      : (title?.absolute ?? title?.default ?? "ActorConsole — Apify operations");
  return value.includes("ActorConsole") ? value : `${value} · ActorConsole`;
}
/** Only trusted build HTML is parsed. All API-derived text is escaped. */
export function publicDocument(template, metadata, { content = "", seed } = {}) {
  const title = pageTitle(metadata.title);
  const description =
    metadata.description ?? "Research, improve, publish and manage your Apify Actors.";
  const canonical = new URL(metadata.path, PUBLIC_SITE).href;
  const tag = (name, value, property = false) =>
    `<meta ${property ? "property" : "name"}="${name}" content="${escapeHtml(value)}"/>`;
  let head = `<title>${escapeHtml(title)}</title>${tag("description", description)}<link rel="canonical" href="${escapeHtml(canonical)}"/>`;
  head +=
    tag("og:title", metadata.openGraph?.title ?? title, true) +
    tag("og:description", metadata.openGraph?.description ?? description, true);
  head +=
    tag("og:type", metadata.openGraph?.type ?? "website", true) + tag("og:url", canonical, true);
  head +=
    tag("twitter:card", metadata.image ? "summary_large_image" : "summary") +
    tag("twitter:title", title) +
    tag("twitter:description", description);
  if (metadata.image && /^https:\/\//.test(metadata.image))
    head += tag("og:image", metadata.image, true);
  if (metadata.publishedAt) head += tag("article:published_time", metadata.publishedAt, true);
  if (metadata.noindex || metadata.robots?.index === false)
    head += tag("robots", "noindex, nofollow");
  // Metadata is replaced in the browser as visitors navigate between routes.
  head = head
    .replaceAll("<meta ", '<meta data-ac-page-meta="" ')
    .replace('<link rel="canonical"', '<link data-ac-page-meta="" rel="canonical"');
  let html = template
    .replace(/<(?:meta|link)\b[^>]*data-ac-page-meta[^>]*>/gi, "")
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\b[^>]*name=["']description["'][^>]*>/i, "");
  html = html.replace("</head>", `${head}</head>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${content}</div>`);
  if (seed) {
    // Raw JSON in a script must never allow a closing script tag.
    const json = JSON.stringify(seed)
      .replaceAll("<", "\\u003c")
      .replaceAll("\u2028", "\\u2028")
      .replaceAll("\u2029", "\\u2029");
    html = html.replace(
      "</body>",
      `<script id="ac-public-read" type="application/json">${json}</script></body>`,
    );
  }
  return html;
}
