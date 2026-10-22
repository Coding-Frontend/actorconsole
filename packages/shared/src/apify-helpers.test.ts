import { describe, it, expect } from "vitest";
import { inferActorLanguage, extractKeywords } from "./apify-helpers.js";

describe("inferActorLanguage", () => {
  it("returns 'other' for empty input", () => {
    expect(inferActorLanguage({})).toBe("other");
  });

  it("detects typescript from explicit hints", () => {
    expect(inferActorLanguage({ description: "Built with TypeScript and Node.js" })).toBe(
      "typescript",
    );
  });

  it("TypeScript wins over plain JS when both hints present", () => {
    expect(
      inferActorLanguage({
        description: "Uses Playwright and TypeScript types in .ts files",
      }),
    ).toBe("typescript");
  });

  it("detects javascript from puppeteer/playwright", () => {
    expect(inferActorLanguage({ description: "Built with Puppeteer and Cheerio" })).toBe(
      "javascript",
    );
  });

  it("detects python from common libs", () => {
    expect(inferActorLanguage({ description: "Built with BeautifulSoup and requests" })).toBe(
      "python",
    );
  });

  it("is case-insensitive", () => {
    expect(inferActorLanguage({ description: "PYTHON AND SELENIUM" })).toBe("python");
  });

  it("looks at title and readme too", () => {
    expect(inferActorLanguage({ title: "Type:", readme: "anywhere" })).toBe("typescript");
    expect(inferActorLanguage({ title: "Scraper", readme: "uses scrapy framework" })).toBe(
      "python",
    );
  });
});

describe("extractKeywords", () => {
  it("returns empty for empty input", () => {
    expect(extractKeywords({})).toEqual([]);
  });

  it("dedupes case-insensitively and sorts by frequency", () => {
    const out = extractKeywords({
      title: "Instagram Instagram Scraper",
      description: "scrape instagram data, export instagram posts, fast and simple",
      max: 5,
    });
    expect(out[0]).toBe("instagram");
    expect(out).toContain("scraper");
    expect(out).toContain("scrape");
  });

  it("strips stop words and short tokens", () => {
    const out = extractKeywords({
      title: "the a an",
      description: "be do does is are",
    });
    expect(out).toEqual([]);
  });

  it("respects max parameter", () => {
    const out = extractKeywords({
      title: "alpha beta gamma delta epsilon zeta eta theta",
      max: 3,
    });
    expect(out.length).toBe(3);
  });

  it("strips punctuation but keeps hyphens", () => {
    const out = extractKeywords({
      title: "facebook-marketplace-scraper",
    });
    expect(out).toContain("facebook-marketplace-scraper");
  });
});
