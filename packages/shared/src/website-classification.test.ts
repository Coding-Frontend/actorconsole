import { describe, expect, it } from "vitest";
import { classifyActorWebsite, extractPublicDomains } from "./website-classification";

describe("website classification", () => {
  it("prefers an official domain over marketing text", () => {
    expect(
      classifyActorWebsite({
        actorName: "places-crawler",
        title: "Business finder",
        description: "Collects listings from https://maps.google.com/",
      }),
    ).toMatchObject({ slug: "google-maps", method: "DOMAIN", confidence: 0.8 });
  });

  it("distinguishes service identities from their parent company", () => {
    expect(
      classifyActorWebsite({ actorName: "search", title: "Google Search Results Scraper" }),
    ).toMatchObject({
      slug: "google-search",
      method: "TITLE_ALIAS",
    });
    expect(
      classifyActorWebsite({ actorName: "maps", title: "Google Maps Reviews Scraper" }),
    ).toMatchObject({
      slug: "google-maps",
      method: "TITLE_ALIAS",
    });
  });

  it("gives exact aliases and title phrases precedence over description-only matches", () => {
    expect(
      classifyActorWebsite({
        actorName: "bing",
        title: "Bing",
        description: "Exports results that can be shared on instagram.com",
      }),
    ).toMatchObject({ slug: "bing", method: "EXACT_ALIAS", confidence: 1 });
    expect(
      classifyActorWebsite({
        actorName: "maps-reviews",
        title: "Google Maps review scraper",
        description: "Exports reports compatible with https://facebook.com",
      }),
    ).toMatchObject({ slug: "google-maps", method: "TITLE_ALIAS" });
  });

  it("uses Multi-site when equally strong evidence names multiple services", () => {
    expect(
      classifyActorWebsite({
        actorName: "social-scraper",
        title: "Instagram and Facebook scraper",
      }),
    ).toMatchObject({ slug: "multi-site", method: "MULTI_SITE" });
  });

  it("uses a neutral fallback without inventing a brand", () => {
    expect(
      classifyActorWebsite({ actorName: "universal-crawler", title: "Universal crawler" }),
    ).toMatchObject({
      slug: "generic-web-data",
      method: "GENERIC",
    });
  });

  it("extracts and deduplicates public domains", () => {
    expect(extractPublicDomains("https://example.com/a and www.example.com/b")).toEqual([
      "example.com",
    ]);
  });

  it("does not classify common Actor source and metadata filenames as websites", () => {
    expect(
      extractPublicDomains(
        "Read actor.json, input_schema.json, README.md, robots.txt, icon.svg and src/main.ts",
      ),
    ).toEqual([]);
    expect(extractPublicDomains("Scrapes actor.dev and data.example.ai")).toEqual([
      "actor.dev",
      "data.example.ai",
    ]);
  });
});
