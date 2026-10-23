import { describe, expect, it } from "vitest";
import {
  actorListingStateSchema,
  listingImprovement,
  scoreActorListing,
} from "./actor-optimization";

describe("actor listing schema", () => {
  it("preserves arbitrary nested JSON schemas and optional listing fields", () => {
    const inputSchema = { type: "object", properties: { urls: { type: "array" } }, required: [] };
    const listing = { title: "Scraper", description: "Gets data", readme: "", inputSchema };
    expect(actorListingStateSchema.parse(listing)).toEqual({ ...listing, categories: [] });
    expect(actorListingStateSchema.parse({ ...listing, inputSchema: null }).inputSchema).toBeNull();
    expect(actorListingStateSchema.safeParse({ ...listing, inputSchema: [] }).success).toBe(false);
  });
});

describe("actor listing optimization scoring", () => {
  it("scores complete, structured listings higher than sparse listings", () => {
    const sparse = scoreActorListing({
      title: "Scraper",
      description: "Gets data",
      categories: [],
      readme: "",
    });
    const complete = scoreActorListing({
      title: "Google Maps Lead Extractor and Business Data Scraper",
      description:
        "Extract verified Google Maps business listings, contact details, ratings, and locations for lead generation and market research.",
      categories: ["LEAD_GENERATION", "BUSINESS", "AUTOMATION"],
      readme: `# Google Maps Lead Extractor\n\n${"Purpose and usage. ".repeat(70)}\n## Input\n\n\`\`\`json\n{}\n\`\`\`\n## Output\n\nResults.\n## How to use\n\nExamples.\n## Pricing\n\nUsage based.\n## FAQ\n\nAnswers.`,
    });

    expect(complete.total).toBeGreaterThan(sparse.total);
    expect(complete.total).toBeLessThanOrEqual(100);
  });

  it("reports point and relative improvements separately", () => {
    expect(listingImprovement(50, 75)).toEqual({ points: 25, percent: 50 });
  });
});
