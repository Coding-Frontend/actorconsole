export type WebsiteIdentitySeed = {
  slug: string;
  name: string;
  canonicalDomain: string | null;
  aliases: string[];
};

export type WebsiteClassification = WebsiteIdentitySeed & {
  confidence: number;
  method:
    | "EXACT_ALIAS"
    | "DOMAIN"
    | "TITLE_ALIAS"
    | "NAME_ALIAS"
    | "DESCRIPTION_ALIAS"
    | "MULTI_SITE"
    | "GENERIC";
  evidence: { value: string; field: string };
};

export const CORE_WEBSITE_IDENTITIES: readonly WebsiteIdentitySeed[] = [
  {
    slug: "google-maps",
    name: "Google Maps",
    canonicalDomain: "maps.google.com",
    aliases: ["google maps", "google map", "google places"],
  },
  {
    slug: "google-search",
    name: "Google Search",
    canonicalDomain: "google.com",
    aliases: ["google search", "google serp", "google results"],
  },
  {
    slug: "google-play",
    name: "Google Play",
    canonicalDomain: "play.google.com",
    aliases: ["google play", "play store"],
  },
  {
    slug: "brave-search",
    name: "Brave Search",
    canonicalDomain: "search.brave.com",
    aliases: ["brave search", "brave browser"],
  },
  {
    slug: "bing",
    name: "Bing",
    canonicalDomain: "bing.com",
    aliases: ["bing", "bing search", "bing images"],
  },
  {
    slug: "instagram",
    name: "Instagram",
    canonicalDomain: "instagram.com",
    aliases: ["instagram", "insta reels", "instagram reels"],
  },
  {
    slug: "facebook",
    name: "Facebook",
    canonicalDomain: "facebook.com",
    aliases: ["facebook", "facebook marketplace", "facebook ads"],
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    canonicalDomain: "linkedin.com",
    aliases: ["linkedin", "linked in"],
  },
  {
    slug: "youtube",
    name: "YouTube",
    canonicalDomain: "youtube.com",
    aliases: ["youtube", "you tube"],
  },
  { slug: "tiktok", name: "TikTok", canonicalDomain: "tiktok.com", aliases: ["tiktok", "tik tok"] },
  {
    slug: "x-twitter",
    name: "X / Twitter",
    canonicalDomain: "x.com",
    aliases: ["twitter", "x.com", "twitter x"],
  },
  { slug: "reddit", name: "Reddit", canonicalDomain: "reddit.com", aliases: ["reddit"] },
  { slug: "amazon", name: "Amazon", canonicalDomain: "amazon.com", aliases: ["amazon"] },
  { slug: "shopify", name: "Shopify", canonicalDomain: "shopify.com", aliases: ["shopify"] },
  { slug: "walmart", name: "Walmart", canonicalDomain: "walmart.com", aliases: ["walmart"] },
  { slug: "ebay", name: "eBay", canonicalDomain: "ebay.com", aliases: ["ebay"] },
  {
    slug: "tripadvisor",
    name: "Tripadvisor",
    canonicalDomain: "tripadvisor.com",
    aliases: ["tripadvisor", "trip advisor"],
  },
  {
    slug: "booking-com",
    name: "Booking.com",
    canonicalDomain: "booking.com",
    aliases: ["booking.com", "booking com"],
  },
  { slug: "airbnb", name: "Airbnb", canonicalDomain: "airbnb.com", aliases: ["airbnb", "air bnb"] },
  { slug: "github", name: "GitHub", canonicalDomain: "github.com", aliases: ["github", "git hub"] },
  {
    slug: "glassdoor",
    name: "Glassdoor",
    canonicalDomain: "glassdoor.com",
    aliases: ["glassdoor"],
  },
  {
    slug: "indeed",
    name: "Indeed",
    canonicalDomain: "indeed.com",
    aliases: ["indeed jobs", "indeed"],
  },
  { slug: "zillow", name: "Zillow", canonicalDomain: "zillow.com", aliases: ["zillow"] },
  { slug: "yelp", name: "Yelp", canonicalDomain: "yelp.com", aliases: ["yelp"] },
  { slug: "generic-web-data", name: "Generic web/data", canonicalDomain: null, aliases: [] },
  { slug: "multi-site", name: "Multi-site", canonicalDomain: null, aliases: [] },
] as const;

function normalized(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase()
    .replace(/[_/.-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(haystack: string, needle: string) {
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${normalized(needle)} `);
}

// Actor metadata frequently contains source filenames such as actor.json,
// README.md, robots.txt, and output_schema.json. Those strings match a broad
// hostname shape but are not websites and must never create catalog entries.
const NON_DOMAIN_SUFFIXES = new Set([
  "css",
  "csv",
  "env",
  "gif",
  "gz",
  "htm",
  "html",
  "ico",
  "jpeg",
  "jpg",
  "js",
  "json",
  "jsx",
  "lock",
  "log",
  "md",
  "mjs",
  "png",
  "py",
  "svg",
  "tar",
  "toml",
  "ts",
  "tsx",
  "txt",
  "webp",
  "xml",
  "yaml",
  "yml",
  "zip",
]);

function isPlausiblePublicDomain(value: string) {
  const labels = value.toLowerCase().split(".");
  if (labels.length < 2 || labels.some((label) => !label || label.length > 63)) return false;
  const suffix = labels.at(-1)!;
  if (suffix.length < 2 || suffix.length > 24 || NON_DOMAIN_SUFFIXES.has(suffix)) return false;
  return labels.every(
    (label) =>
      /^xn--[a-z0-9-]+$/.test(label) ||
      (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label) && !label.includes("--")),
  );
}

export function extractPublicDomains(value: string | null | undefined): string[] {
  if (!value) return [];
  const matches = value.matchAll(
    /(?:https?:\/\/)?(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,})(?:[/:?#\s]|$)/gi,
  );
  return [
    ...new Set(
      [...matches]
        .map((match) => match[1].toLocaleLowerCase())
        .filter(isPlausiblePublicDomain),
    ),
  ];
}

function matchesDomain(candidate: string, canonical: string) {
  return (
    candidate === canonical ||
    candidate.endsWith(`.${canonical}`) ||
    canonical.endsWith(`.${candidate}`)
  );
}

export function classifyActorWebsite(
  input: {
    actorName: string;
    title?: string | null;
    description?: string | null;
    metadata?: unknown;
  },
  identities: readonly WebsiteIdentitySeed[] = CORE_WEBSITE_IDENTITIES,
): WebsiteClassification {
  const usable = identities.filter(
    (identity) => !["generic-web-data", "multi-site"].includes(identity.slug),
  );
  const multiSite = (field: string, value: string): WebsiteClassification => {
    const identity =
      identities.find((item) => item.slug === "multi-site") ?? CORE_WEBSITE_IDENTITIES.at(-1)!;
    return { ...identity, confidence: 0.6, method: "MULTI_SITE", evidence: { field, value } };
  };
  const aliasMatches = (value: string, exact: boolean) =>
    usable.filter((identity) =>
      identity.aliases.some((alias) =>
        exact ? value === normalized(alias) : containsPhrase(value, alias),
      ),
    );
  const chooseAlias = (
    field: "title" | "actorName" | "description",
    value: string,
    exact = false,
  ): WebsiteClassification | null => {
    const matched = aliasMatches(value, exact);
    if (matched.length === 1) {
      const identity = matched[0];
      const method = exact
        ? "EXACT_ALIAS"
        : field === "title"
          ? "TITLE_ALIAS"
          : field === "actorName"
            ? "NAME_ALIAS"
            : "DESCRIPTION_ALIAS";
      const confidence = exact ? 1 : field === "title" ? 0.94 : field === "actorName" ? 0.9 : 0.72;
      return { ...identity, confidence, method, evidence: { field, value } };
    }
    return matched.length > 1 ? multiSite(field, value) : null;
  };
  const chooseDomain = (field: string, value: string): WebsiteClassification | null => {
    const domains = extractPublicDomains(value);
    const matched = [
      ...new Map(
        domains.flatMap((domain) => {
          const identity = usable
            .filter(
              (candidate) =>
                Boolean(candidate.canonicalDomain) &&
                matchesDomain(domain, candidate.canonicalDomain!),
            )
            .sort(
              (left, right) =>
                (right.canonicalDomain?.length ?? 0) - (left.canonicalDomain?.length ?? 0),
            )[0];
          return identity ? [[identity.slug, identity] as const] : [];
        }),
      ).values(),
    ];
    if (matched.length === 0) return null;
    if (matched.length > 1) return multiSite(field, domains.join(", "));
    const identity = matched[0];
    return {
      ...identity,
      confidence: field === "description" ? 0.8 : 0.98,
      method: "DOMAIN",
      evidence: { field, value: identity.canonicalDomain! },
    };
  };

  const title = normalized(input.title);
  const actorName = normalized(input.actorName);
  const description = normalized(input.description);
  const metadata = JSON.stringify(input.metadata ?? "");

  // Exact identity names are the strongest signal. Title/name phrases then
  // outrank domains or aliases that only appear in long descriptive copy.
  for (const [field, value] of [
    ["title", title],
    ["actorName", actorName],
  ] as const) {
    const result = chooseAlias(field, value, true);
    if (result) return result;
  }
  for (const [field, value] of [
    ["title", title],
    ["actorName", actorName],
  ] as const) {
    const result = chooseAlias(field, value);
    if (result) return result;
  }
  const structuredDomain = chooseDomain(
    "title/name/metadata",
    `${input.title ?? ""} ${input.actorName} ${metadata}`,
  );
  if (structuredDomain) return structuredDomain;
  const descriptionAlias = chooseAlias("description", description);
  if (descriptionAlias) return descriptionAlias;
  const descriptionDomain = chooseDomain("description", input.description ?? "");
  if (descriptionDomain) return descriptionDomain;

  const generic =
    identities.find((identity) => identity.slug === "generic-web-data") ??
    CORE_WEBSITE_IDENTITIES.at(-2)!;
  return {
    ...generic,
    confidence: 0.25,
    method: "GENERIC",
    evidence: { field: "actor", value: input.actorName },
  };
}
