import { beforeEach, describe, expect, it, vi } from "vitest";

const completeAiText = vi.hoisted(() => vi.fn());

vi.mock("../lib/text-router", () => ({
  completeAiText,
  parseJsonResponse: (value: string) => JSON.parse(value),
}));

import { rewriteActorCopy } from "./copy-rewrite";

describe("rewriteActorCopy", () => {
  beforeEach(() => completeAiText.mockReset());

  it("generates copy variants without proposing marketplace categories", async () => {
    completeAiText.mockImplementationOnce(async (options) =>
      options.parse(
        JSON.stringify({
          variants: [
            {
              title: "Google Maps Lead Extractor",
              description: "Extract business listings and contacts from Google Maps.",
              seoTitle: "Google Maps Lead Extractor",
              seoDescription:
                "Extract Google Maps business listings and contacts for prospecting and market research.",
              reasoning: "Uses specific, proven outcomes.",
            },
          ],
        }),
      ),
    );

    const result = await rewriteActorCopy({
      actorTitle: "Test Actor",
      actorDescription: "Extracts useful data.",
      sourceSummary: "Accepts a URL and returns structured data.",
      language: "javascript",
      keywords: ["data extraction"],
    });

    const request = completeAiText.mock.calls[0]?.[0];
    for (const field of [
      '"title"',
      '"description"',
      '"seoTitle"',
      '"seoDescription"',
      '"reasoning"',
    ]) {
      expect(request.prompt).toContain(field);
    }
    expect(request.prompt).toContain("Do not rename or omit any field");
    expect(request.system).toContain("Never generate, suggest, or change categories");
    expect(request.prompt).not.toContain('"categories"');
    expect(result[0]?.reasoning).toContain("specific");
  });
});
