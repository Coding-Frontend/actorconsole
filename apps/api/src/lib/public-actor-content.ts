
import {
  getAdminApifyClient,
  getPublicActor,
  type ApifyActorTextReview,
} from "@actorconsole/apify";

export type PublicActorDocumentation = {
  readme: string | null;
  inputSchema: unknown;
  outputSchema: unknown;
  ratingBreakdown: Record<string, number> | null;
  rating: number | null;
  reviewCount: number | null;
  reviews: ApifyActorTextReview[];
  reviewError: string | null;
  sourceUrl: string;
};

export type PublicActorReviews = Pick<PublicActorDocumentation, "reviews" | "reviewError">;

const APIFY_WEB_ORIGIN = "https://apify.com";
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function actorUrl(username: string, actorName: string, suffix = "") {
  return `${APIFY_WEB_ORIGIN}/${encodeURIComponent(username)}/${encodeURIComponent(actorName)}${suffix}`;
}

async function fetchPublicDocument(
  url: string,
  accept: string,
  options: { attempts?: number; timeoutMs?: number } = {},
) {
  const attempts = Math.min(Math.max(options.attempts ?? 3, 1), 3);
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 4_000, 500), 8_000);
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      // `AbortSignal.timeout()` alone is not sufficient in every Next.js
      // runtime: an upstream fetch can occasionally remain pending after the
      // signal fires. Race both the response and body read so an optional
      // Store document can never keep the public Actor page loading forever.
      const response = await withTimeout(
        fetch(url, {
          // Actor HTML and Markdown can be megabytes per URL. Do not persist
          // complete upstream responses in Next.js's on-disk fetch cache.
          headers: { accept },
          signal: AbortSignal.timeout(timeoutMs),
        }),
        timeoutMs + 250,
        "Apify Store response",
      );
      if (response.ok) {
        return withTimeout(response.text(), timeoutMs + 250, "Apify Store document");
      }
      lastError = new Error(`Apify Store returned HTTP ${response.status}`);
      if (!RETRYABLE_STATUSES.has(response.status)) break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
  throw lastError ?? new Error("Apify Store content was unavailable");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} took too long`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readmeFromMarkdown(markdown: string) {
  const marker = /^# README\s*$/im.exec(markdown);
  if (!marker) return markdown.trim() || null;
  const fromReadme = markdown.slice((marker.index ?? 0) + marker[0].length);
  const apiMarker = /^# API\s*$/im.exec(fromReadme);
  return (apiMarker ? fromReadme.slice(0, apiMarker.index) : fromReadme).trim() || null;
}

/** Public REST responses omit README; the Store Markdown page remains readable. */
export async function getPublicActorReadme(username: string, actorName: string) {
  try {
    return readmeFromMarkdown(await withTimeout(fetchPublicDocument(
      actorUrl(username, actorName, ".md"), "text/markdown, text/plain;q=0.9",
      { attempts: 1, timeoutMs: 2_500 },
    ), 2_750, "Public README lookup"));
  } catch {
    return null;
  }
}

function extractBalancedJson(source: string, startAt: number) {
  const objectStart = source.indexOf("{", startAt);
  if (objectStart < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(objectStart, index + 1);
    }
  }
  return null;
}

function flightStrings(html: string) {
  const values: string[] = [];
  const scripts = html.matchAll(/<script[^>]*>self\.__next_f\.push\((.*?)\)<\/script>/gs);
  for (const script of scripts) {
    try {
      const payload = JSON.parse(script[1]);
      if (typeof payload?.[1] === "string") values.push(payload[1]);
    } catch {
      // A malformed hydration payload should not make an Actor page fail.
    }
  }
  return values;
}

function publicSchemasAndRating(html: string) {
  const payload = flightStrings(html).find(
    (item) => item.includes('"actorDefinition"') && item.includes('"input"'),
  );
  if (!payload) {
    return {
      inputSchema: null,
      outputSchema: null,
      rating: null,
      reviewCount: null,
      ratingBreakdown: null,
    };
  }
  const definitionJson = extractBalancedJson(payload, payload.indexOf('"actorDefinition"'));
  let definition: Record<string, unknown> | null = null;
  try {
    definition = definitionJson ? (JSON.parse(definitionJson) as Record<string, unknown>) : null;
  } catch {
    definition = null;
  }
  const ratingJson = extractBalancedJson(payload, payload.indexOf('"reviewsFullRating"'));
  let ratingInfo: Record<string, unknown> | null = null;
  try {
    ratingInfo = ratingJson ? (JSON.parse(ratingJson) as Record<string, unknown>) : null;
  } catch {
    ratingInfo = null;
  }
  const rating = typeof ratingInfo?.rating === "number" ? ratingInfo.rating : null;
  const reviewCount = typeof ratingInfo?.reviewsCount === "number" ? ratingInfo.reviewsCount : null;
  const ratingBreakdown =
    ratingInfo?.ratingStats && typeof ratingInfo.ratingStats === "object"
      ? Object.fromEntries(
          Object.entries(ratingInfo.ratingStats as Record<string, unknown>).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number",
          ),
        )
      : null;
  return {
    inputSchema: definition?.input ?? null,
    outputSchema: definition?.output ?? null,
    rating,
    reviewCount,
    ratingBreakdown,
  };
}

/**
 * Read the rating summary rendered by the public Store page. The public REST
 * Actor response is faster for actor metrics but can lag newly submitted
 * reviews, so public headers and the reviews panel share this source.
 */
export async function getPublicActorStoreRating(username: string, actorName: string) {
  try {
    return publicSchemasAndRating(
      await fetchPublicDocument(
        actorUrl(username, actorName),
        "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        { attempts: 1, timeoutMs: 2_500 },
      ),
    );
  } catch {
    return {
      inputSchema: null,
      outputSchema: null,
      rating: null,
      reviewCount: null,
      ratingBreakdown: null,
    };
  }
}

export async function getPublicActorDocumentation(
  username: string,
  actorName: string,
  _actorId: string,
): Promise<PublicActorDocumentation> {
  const sourceUrl = actorUrl(username, actorName);
  const publicActorResult = await Promise.allSettled([
    withTimeout(getPublicActor(`${username}/${actorName}`), 3_000, "Apify public Actor lookup"),
  ]);
  const publicActor =
    publicActorResult[0]?.status === "fulfilled" ? publicActorResult[0].value : null;
  const publicStats = publicActor?.stats ?? null;

  let readme: string | null = publicActor?.readme ?? null;
  let inputSchema: unknown = publicActor?.inputSchema ?? null;
  let outputSchema: unknown = publicActor?.outputSchema ?? null;
  let catalog = {
    inputSchema: null as unknown,
    outputSchema: null as unknown,
    rating: null as number | null,
    reviewCount: null as number | null,
    ratingBreakdown: null as Record<string, number> | null,
  };

  // The Store REST response is the fastest source for schemas and README,
  // but its rating aggregate can lag the public Actor page. Fetch the public
  // page alongside a missing README so the rating/count and distribution come
  // from the same source visitors see. Schema fallbacks remain best-effort.
  {
    const [markdownResult, htmlResult] = await Promise.allSettled([
      readme
        ? Promise.resolve("")
        : fetchPublicDocument(
            actorUrl(username, actorName, ".md"),
            "text/markdown, text/plain;q=0.9",
            { attempts: 1, timeoutMs: 2_500 },
          ),
      fetchPublicDocument(sourceUrl, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", {
        attempts: 1,
        timeoutMs: 2_500,
      }),
    ]);
    if (!readme && markdownResult.status === "fulfilled") {
      readme = readmeFromMarkdown(markdownResult.value);
    }
    if (htmlResult.status === "fulfilled") {
      catalog = publicSchemasAndRating(htmlResult.value);
      inputSchema ??= catalog.inputSchema;
      outputSchema ??= catalog.outputSchema;
    }
  }

  return {
    readme,
    ...catalog,
    inputSchema,
    outputSchema,
    // Prefer the Store page aggregate. It includes the newest public reviews,
    // whereas `GET /v2/acts` can return an older summary for the same Actor.
    rating: catalog.rating ?? publicStats?.actorReviewRating ?? null,
    reviewCount: catalog.reviewCount ?? publicStats?.actorReviewCount ?? null,
    reviews: [],
    reviewError: null,
    sourceUrl,
  };
}

/**
 * Review text is loaded separately from the initial documentation request.
 * Prefer Apify's public Store page and use the privileged Console endpoint only
 * as a fallback, so a slow or expired credential cannot hold the README,
 * schemas, or aggregate rating hostage.
 */
export async function getPublicActorReviews(
  actorId: string,
  identity?: { username: string; actorName: string },
): Promise<PublicActorReviews> {
  const username = identity?.username;
  const actorName = identity?.actorName;
  if (username && actorName) {
    try {
      const html = await fetchPublicDocument(
        actorUrl(username, actorName, "/reviews"),
        "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        { attempts: 2, timeoutMs: 4_000 },
      );
      const publicReviews = parsePublicActorReviews(html);
      // The Store reviews page is the authoritative public source. An empty
      // list is also meaningful: an Actor can have aggregate star ratings
      // without any written review text.
      if (hasPublicReviewsList(html)) {
        return { reviews: publicReviews, reviewError: null };
      }
    } catch {
      // Fall back to the owner Console endpoint below. Public Actor pages must
      // remain usable when either Apify surface is temporarily unavailable.
    }
  }

  try {
    const client = await withTimeout(getAdminApifyClient(), 1_500, "Apify credential lookup");
    if (!client) {
      return {
        reviews: [],
        reviewError:
          "Apify publishes the aggregate rating publicly, but individual written reviews are unavailable right now.",
      };
    }
    try {
      const reviews = await withTimeout(
        client.getActorTextReviews(actorId),
        5_000,
        "Apify reviews request",
      );
      return { reviews, reviewError: null };
    } catch (error) {
      return {
        reviews: [],
        reviewError: publicReviewFallback(error),
      };
    }
  } catch (error) {
    return {
      reviews: [],
      reviewError: publicReviewFallback(error),
    };
  }
}

/**
 * Extract written reviews from the server-rendered public Apify Store page.
 * Apify intentionally keeps star aggregates public while its Console reviews
 * endpoint is owner-session scoped. Reading the public page first prevents an
 * unrelated or expired Console credential from turning a public review panel
 * into a 401/403/404 error.
 */
export function parsePublicActorReviews(html: string): ApifyActorTextReview[] {
  if (!hasPublicReviewsList(html)) return [];
  const list = html.slice(html.search(/data-test=["']reviews-list["']/i));
  const cards = list.split(/(?=<div[^>]+actor_review__StyledActorReview)/i).slice(1);

  return cards.reduce<ApifyActorTextReview[]>((reviews, card, index) => {
    const authorUsername = decodeHtml(
      card.match(/aria-label=["']([^"']+?)\s+avatar["']/i)?.[1] ?? "",
    ).trim();
    const ratingRegion =
      card.match(
        /class=["'][^"']*reviewRating[^"']*["']>([\s\S]*?)(?:created_at_label__StyledCreatedAtString|<\/div>\s*<\/div>\s*<\/div>)/i,
      )?.[1] ?? "";
    const rating = Math.min(5, (ratingRegion.match(/<svg\b/gi) ?? []).length);
    const textRegion = card.match(
      /paragraphs__ParagraphContainer[^>]*>([\s\S]*?)(?:<\/div>\s*<\/div>|actor_review__StyledActorReview)/i,
    )?.[1];
    const text = textRegion ? htmlText(textRegion) : "";

    if (!authorUsername || !text) return reviews;
    reviews.push({
      id: `public-${authorUsername}-${index}`,
      rating,
      text,
      createdAt: null,
      authorName: null,
      authorUsername,
      developerReply: null,
      developerReplyAt: null,
    });
    return reviews;
  }, []);
}

function hasPublicReviewsList(html: string) {
  return /data-test=["']reviews-list["']/i.test(html);
}

function htmlText(value: string) {
  return decodeHtml(
    value
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[\t\r ]+/g, " ")
      .replace(/\n\s+/g, "\n"),
  ).trim();
}

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    hellip: "…",
    mdash: "—",
    ndash: "–",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
    if (token.startsWith("#x") || token.startsWith("#")) {
      const codePoint = Number.parseInt(
        token.slice(token.startsWith("#x") ? 2 : 1),
        token.startsWith("#x") ? 16 : 10,
      );
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return named[token.toLocaleLowerCase()] ?? entity;
  });
}

export function publicReviewFallback(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/HTTP\s+(401|403|404)|token|credential|user was not found|permission/i.test(message)) {
    return "Apify exposes the aggregate rating publicly, but individual written reviews require a valid owner Console session.";
  }
  return "Individual written reviews could not be loaded from Apify. The public rating summary remains available.";
}
