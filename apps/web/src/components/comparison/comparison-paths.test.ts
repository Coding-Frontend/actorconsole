import { describe, expect, it } from "vitest";
import {
  dashboardActorComparisonHref,
  parseComparisonPath,
  publicComparisonHref,
} from "./comparison-paths";

describe("comparison paths", () => {
  it("uses path segments for builder selections and keeps period as a separate option", () => {
    expect(publicComparisonHref("builder", ["automation-lab", "codingfrontend"])).toBe(
      "/builders/compare/automation-lab/codingfrontend",
    );
    expect(publicComparisonHref("builder", ["automation-lab", "codingfrontend"], 7)).toBe(
      "/builders/compare/automation-lab/codingfrontend?window=7",
    );
    expect(parseComparisonPath("builder", ["automation-lab", "codingfrontend"])).toEqual([
      "automation-lab",
      "codingfrontend",
    ]);
  });

  it("round trips Actor owners and names without ambiguous boundaries", () => {
    const ids = ["automation-lab/maps-scraper", "codingfrontend/web-crawler"];
    expect(publicComparisonHref("actor", ids)).toBe(
      "/actors/compare/automation-lab/maps-scraper/~codingfrontend/web-crawler",
    );
    expect(
      parseComparisonPath("actor", [
        "automation-lab",
        "maps-scraper",
        "~codingfrontend",
        "web-crawler",
      ]),
    ).toEqual(ids);
    expect(dashboardActorComparisonHref(ids, "web scraping")).toBe(
      "/dashboard/keywords/compare/automation-lab/maps-scraper/~codingfrontend/web-crawler?q=web%20scraping",
    );
  });

  it("rejects malformed or oversized selections", () => {
    expect(parseComparisonPath("actor", ["one", "actor", "two", "actor"])).toBeNull();
    expect(parseComparisonPath("actor", ["one", "actor", "~two"])).toBeNull();
    expect(parseComparisonPath("builder", ["bad!slug"])).toBeNull();
    expect(parseComparisonPath("builder", ["a", "b", "c", "d", "e", "f"])).toBeNull();
  });
});
