import { describe, expect, it } from "vitest";
import { parsePublicActorReviews, publicReviewFallback } from "./public-actor-content";

describe("publicReviewFallback", () => {
  it("does not expose invalid Console credential errors to public visitors", () => {
    const message = publicReviewFallback(
      new Error(
        "Apify Console request failed with HTTP 401: User was not found or authentication token is not valid",
      ),
    );

    expect(message).toContain("aggregate rating publicly");
    expect(message).not.toContain("HTTP 401");
    expect(message).not.toContain("token is not valid");
  });
});

describe("parsePublicActorReviews", () => {
  it("reads written reviews from the public Apify Store markup", () => {
    const reviews = parsePublicActorReviews(`
      <div data-test="reviews-list">
        <div class="actor_review__StyledActorReview-sc-1 card">
          <svg aria-label="builder_one avatar"></svg>
          <div class="reviewRating">
            <div><svg></svg><svg></svg><svg></svg><svg></svg><svg></svg></div>
            <span class="created_at_label__StyledCreatedAtString">2 days ago</span>
          </div>
          <div class="paragraphs__ParagraphContainer-sc-1">
            <span>Fast &amp; reliable &mdash; exactly what I needed.</span>
          </div>
        </div>
      </div>
    `);

    expect(reviews).toEqual([
      expect.objectContaining({
        authorUsername: "builder_one",
        rating: 5,
        text: "Fast & reliable — exactly what I needed.",
      }),
    ]);
  });
});
