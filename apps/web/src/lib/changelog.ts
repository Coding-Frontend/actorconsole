import type { ChangelogCategory } from "@/services/changelog";

export const CHANGELOG_CATEGORIES: Record<ChangelogCategory, { label: string; badge: string }> = {
  RELEASE: {
    label: "New release",
    badge: "border-signal-green/30 bg-signal-green/10 text-signal-green",
  },
  IMPROVEMENT: {
    label: "Improvement",
    badge: "border-signal-blue/30 bg-signal-blue/10 text-signal-blue",
  },
  RETIRED: { label: "Retired", badge: "border-destructive/30 bg-destructive/10 text-destructive" },
};
export const CHANGELOG_PRODUCT_TAGS = [
  "actors",
  "dashboard",
  "api",
  "integrations",
  "billing",
  "security",
  "developer-tools",
];
export const tagLabel = (tag: string) =>
  tag === "api"
    ? "API"
    : tag
        .split("-")
        .map((word) => word[0]?.toUpperCase() + word.slice(1))
        .join(" ");
export const articleHref = (slug: string) => `/changelog/${encodeURIComponent(slug)}`;
export const changelogDateLabel = (date: string, short = false) =>
  new Intl.DateTimeFormat("en-US", {
    month: short ? "short" : "long",
    day: "numeric",
    ...(short ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));

/** Only forward supported, valid URL controls to the strict public API. */
export function changelogQuery(input: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  const first = (key: string) => (Array.isArray(input[key]) ? input[key][0] : input[key]);
  const category = first("category");
  if (category && Object.hasOwn(CHANGELOG_CATEGORIES, category)) params.set("category", category);
  for (const [key, min, max] of [
    ["year", 2000, 9998],
    ["page", 1, 100_000],
    ["month", 1, 12],
  ] as const) {
    const value = first(key);
    if (value && /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max)
      params.set(key, value);
  }
  if (first("match") === "all") params.set("match", "all");
  const tags = input.tag ? (Array.isArray(input.tag) ? input.tag : [input.tag]) : [];
  for (const tag of [...new Set(tags)]
    .filter((tag) => tag.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag))
    .slice(0, 12))
    params.append("tag", tag);
  return params;
}
