/**
 * Heuristics for inferring an Apify Actor's implementation language
 * from its description, name, or other observable metadata. Callers that have
 * source context can pass it separately to the AI workflows; this helper does
 * not claim to inspect arbitrary local files.
 */
export type ActorLanguage = "javascript" | "typescript" | "python" | "other";

const JS_HINTS = ["node.js", "nodejs", "puppeteer", "playwright", "cheerio", "axios"];
const TS_HINTS = ["typescript", "type:", "@types/", ".ts "];
const PY_HINTS = ["python", "beautifulsoup", "scrapy", "selenium", "requests", "pandas"];

export function inferActorLanguage(input: {
  title?: string | null;
  description?: string | null;
  readme?: string | null;
}): ActorLanguage {
  const blob =
    `${input.title ?? ""}\n${input.description ?? ""}\n${input.readme ?? ""}`.toLowerCase();

  let tsScore = 0;
  let pyScore = 0;
  let jsScore = 0;
  for (const hint of TS_HINTS) if (blob.includes(hint)) tsScore += 2;
  for (const hint of PY_HINTS) if (blob.includes(hint)) pyScore += 2;
  for (const hint of JS_HINTS) if (blob.includes(hint)) jsScore += 1;
  // TypeScript always wins over plain JS when present
  if (tsScore > 0) return "typescript";
  if (pyScore > jsScore) return "python";
  if (jsScore > 0) return "javascript";
  return "other";
}

/**
 * Pull likely keywords out of an actor's title + description for SEO use.
 * Strips stop words, normalizes case, dedupes.
 */
const STOP = new Set([
  "a",
  "an",
  "and",
  "or",
  "but",
  "for",
  "the",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "this",
  "that",
  "these",
  "those",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "as",
  "it",
  "its",
  "you",
  "your",
  "we",
  "our",
  "their",
  "his",
  "her",
  "i",
  "me",
  "my",
  "do",
  "does",
  "did",
  "can",
  "could",
  "should",
  "would",
  "will",
  "may",
  "might",
  "fast",
  "quick",
  "easy",
  "simple",
  "best",
  "top",
  "ultimate",
]);

export function extractKeywords(input: {
  title?: string | null;
  description?: string | null;
  max?: number;
}): string[] {
  const max = input.max ?? 8;
  const blob = `${input.title ?? ""} ${input.description ?? ""}`;
  const tokens = blob
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t));
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([k]) => k);
}
