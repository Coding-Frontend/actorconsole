export interface ApifyActorTextReview {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string | null;
  authorName: string | null;
  authorUsername: string | null;
  developerReply: string | null;
  developerReplyAt: string | null;
}

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
