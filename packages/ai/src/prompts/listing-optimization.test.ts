import { beforeEach, describe, expect, it, vi } from "vitest";

const { completeAiText } = vi.hoisted(() => ({ completeAiText: vi.fn() }));

vi.mock("../lib/text-router", () => ({
  completeAiText: (...args: unknown[]) => completeAiText(...args),
  parseJsonResponse: JSON.parse,
}));

import { auditActorListing } from "./listing-optimization";

describe("auditActorListing", () => {
  beforeEach(() => completeAiText.mockReset());

  it("requests an approval-ready proposal without category mutations", async () => {
    completeAiText.mockImplementationOnce(async (options) =>
      options.parse(
        JSON.stringify({
          proposal: {
            title: "Google Maps Lead Extractor for Business Research",
            description:
              "Extract Google Maps business listings and contact data for lead generation and market research.",
            pricing: null,
          },
          issues: [
            { field: "title", severity: "medium", message: "The original title was generic." },
          ],
          summary: "The proposed listing is more specific and easier to evaluate.",
        }),
      ),
    );

    const result = await auditActorListing({
      current: {
        title: "Maps Scraper",
        description: "Gets maps data",
        categories: ["OTHER"],
        readme: "Old README",
      },
      language: "typescript",
      keywords: ["google maps", "leads"],
    });

    expect(result.proposal).toEqual({
      title: "Google Maps Lead Extractor for Business Research",
      description:
        "Extract Google Maps business listings and contact data for lead generation and market research.",
      pricing: null,
    });
    expect(completeAiText).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 20_000 }));
  });
});
