import { describe, expect, it } from "vitest";
import { DOC_GUIDES, findDocGuide, searchDocGuides } from "./documentation";
import sitemap from "@/app/sitemap";

describe("documentation routes and discovery", () => {
  it("preserves existing guide URLs and gives every advertised guide a real article", () => {
    const existing = [
      "getting-started",
      "dashboard-tour",
      "first-workspace",
      "mcp-quickstart",
      "mcp-config",
      "mcp-credentials",
      "mcp-tools",
      "mcp-auth",
      "actors-workspace",
      "actor-detail",
      "apify-connection",
      "account-notifications",
      "ai-listing-studio",
      "analytics-usage-costs",
      "bulk-publishing",
      "api-auth",
      "api-endpoints",
      "api-errors",
      "api-rate-limits",
      "schedules-automation",
      "cron",
    ];
    for (const id of existing) expect(findDocGuide(id)?.summary.length).toBeGreaterThan(20);
    for (const entry of sitemap()) {
      const path = new URL(entry.url).pathname;
      if (path.startsWith("/docs/")) expect(findDocGuide(path.slice(6))).toBeDefined();
    }
    for (const guide of DOC_GUIDES) {
      for (const link of guide.links) {
        if (link.href.startsWith("/docs/")) expect(findDocGuide(link.href.slice(6))).toBeDefined();
      }
    }
    expect(new Set(DOC_GUIDES.map((guide) => guide.id)).size).toBe(DOC_GUIDES.length);
  });

  it("finds terms inside instructions and advanced references", () => {
    expect(findDocGuide("actor-sdk")).toBeUndefined();
    expect(searchDocGuides("ACTORCONSOLE_KEY")).toEqual([]);
    expect(searchDocGuides("idempotency").map((guide) => guide.id)).toContain("mcp-tools");
    expect(searchDocGuides("PAY_PER_EVENT").map((guide) => guide.id)).toContain("pricing");
    expect(searchDocGuides("rotate").map((guide) => guide.id)).toContain("mcp-credentials");
    expect(searchDocGuides("Authorize browser").map((guide) => guide.id)).toContain(
      "apify-connection",
    );
    expect(searchDocGuides("   ")).toEqual([]);
    expect(searchDocGuides("an-unrelated-search-term")).toEqual([]);
  });

  it("keeps the initial reading short and each section link unambiguous", () => {
    for (const guide of DOC_GUIDES) {
      const visible = [
        guide.summary,
        guide.note,
        ...(guide.steps ?? []),
        ...(guide.sections ?? [])
          .filter((section) => !section.collapsed)
          .flatMap((section) => [
            ...(section.paragraphs ?? []),
            ...(section.steps ?? []),
            ...(section.items ?? []),
          ]),
      ];
      expect(visible.filter(Boolean).join(" ").split(/\s+/).length, guide.id).toBeLessThanOrEqual(
        200,
      );
      const sectionIds = (guide.sections ?? []).map((section) => section.id);
      expect(new Set(sectionIds).size, guide.id).toBe(sectionIds.length);
    }
  });
});
