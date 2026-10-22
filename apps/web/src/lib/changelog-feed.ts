import type { ChangelogArticle } from "@/services/changelog";

const xml = (value: string) =>
  value
    // XML 1.0 excludes these control characters.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(
      /[<>&"']/g,
      (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!,
    );
export function changelogFeed(items: ChangelogArticle[], siteUrl: string) {
  const base = new URL(siteUrl).origin;
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>ActorConsole Changelog</title><link>${xml(base)}/changelog</link><description>New features, improvements, and product updates from ActorConsole.</description><language>en-us</language><atom:link href="${xml(base)}/changelog/feed" rel="self" type="application/rss+xml"/>${items
    .map((entry) => {
      const link = `${base}/changelog/${encodeURIComponent(entry.slug)}`;
      return `<item><title>${xml(entry.title)}</title><link>${xml(link)}</link><guid isPermaLink="true">${xml(link)}</guid><pubDate>${new Date(`${entry.releaseDate}T00:00:00Z`).toUTCString()}</pubDate><description>${xml(entry.text)}</description><category>${xml(entry.category)}</category>${entry.tags.map((tag) => `<category>${xml(tag)}</category>`).join("")}</item>`;
    })
    .join("")}</channel></rss>`;
}
