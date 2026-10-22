import { describe, expect, it } from "vitest";
import { auditActorSeo, calculatePricing, csvCell } from "./actor-intelligence";
import { stableJson, watchSignals, type WatchMetrics } from "./watch-signals";

describe("pricing and listing tools", () => {
  it("does not invent margins or break-even prices without their denominators", () => {
    expect(
      calculatePricing({ pricePerThousand: 0, results: 0, platformCost: 2, externalCost: 3 }),
    ).toEqual({ revenue: 0, costs: 5, profit: -5, margin: null, breakEvenPerThousand: null });
    expect(
      calculatePricing({ pricePerThousand: 5, results: 10000, platformCost: 8, externalCost: 4 })
        .profit,
    ).toBe(38);
  });
  it("prevents spreadsheet formulas in exported text", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell(null)).toBe('""');
  });
  it("labels SEO checks as editorial and preserves actual metadata", () => {
    const audit = auditActorSeo({
      title: "Ignored fallback",
      seoTitle: "Maps contacts and business lead extractor",
      description: "",
      seoDescription:
        "Find businesses and export structured contact details from a location-based search for research and sales workflows.",
      readme: "# Usage\n" + "Example output. ".repeat(30),
    });
    expect(audit.title).toContain("Maps contacts");
    expect(audit.score).toBe(80);
    expect(audit.disclaimer).toContain("not an Apify ranking prediction");
  });
  it("does not penalize documentation that the public source did not return", () => {
    const audit = auditActorSeo({
      title: "Maps contacts and business lead extractor",
      description:
        "Public business contact data for location-based sales research and monitoring workflows, with configurable filters and structured exports.",
    });
    expect(audit.assessedChecks).toBe(3);
    expect(audit.score).toBe(100);
    expect(audit.checks.filter((check) => check.passed === null)).toHaveLength(2);
    expect(
      auditActorSeo({
        title: audit.title,
        description: audit.description,
        readme: "",
      }).checks.filter((check) => check.passed === null),
    ).toHaveLength(0);
  });
});
describe("watch signals", () => {
  const baseline: WatchMetrics = {
    users30Days: 100,
    runs30Days: 1000,
    reviewRating: 4,
    pricing: [{ model: "PPE", price: 1 }],
    isPublic: true,
    rank: 10,
  };
  it("ignores small demand changes, absent history, and JSON key ordering", () => {
    expect(stableJson({ a: 1, b: 2 })).toBe(stableJson({ b: 2, a: 1 }));
    expect(
      watchSignals(baseline, {
        ...baseline,
        users30Days: 109,
        runs30Days: null,
        pricing: [{ price: 1, model: "PPE" }],
      }),
    ).toEqual([]);
  });
  it("reports meaningful demand, pricing, and rank changes", () => {
    const signals = watchSignals(baseline, {
      ...baseline,
      users30Days: 120,
      pricing: [{ model: "PPE", price: 2 }],
      rank: 9,
    });
    expect(signals).toHaveLength(3);
    expect(signals).toContain("Active-user rank: #10 → #9");
  });
});
