import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockGroupBy = vi.fn();
const mockCount = vi.fn();
const mockTags = vi.fn();

vi.mock("@actorconsole/db", () => ({
  db: {
    changelogEntry: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    changelogEntryTag: { findMany: (...args: unknown[]) => mockTags(...args) },
  },
}));

vi.mock("../../src/lib/analytics.js", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@actorconsole/shared", () => ({
  getLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import { onErrorHandler } from "../../src/middleware/error.js";
import { changelogRoutes } from "../../src/routes/changelog.js";

function buildApp() {
  const app = new Hono();
  app.onError(onErrorHandler);
  app.route("/changelog", changelogRoutes);
  return app;
}

describe("Changelog routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /changelog/", () => {
    it("returns published changelog entries grouped by version", async () => {
      mockFindMany.mockResolvedValueOnce([
        {
          id: "c1",
          version: "1.2.0",
          releaseDate: new Date("2026-07-01"),
          versionSummary: "Major release",
          type: "feature",
          text: "Added new dashboard",
          sortOrder: 1,
        },
        {
          id: "c2",
          version: "1.2.0",
          releaseDate: new Date("2026-07-01"),
          versionSummary: "Major release",
          type: "fix",
          text: "Fixed login bug",
          sortOrder: 2,
        },
      ]);

      const res = await buildApp().request("/changelog");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.releases).toHaveLength(1);
      expect(body.data.releases[0].version).toBe("1.2.0");
      expect(body.data.releases[0].entries).toHaveLength(2);
      expect(body.data.releases[0].entries[0].type).toBe("feature");
    });

    it("returns empty array when no published entries exist", async () => {
      mockFindMany.mockResolvedValueOnce([]);
      const res = await buildApp().request("/changelog");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.releases).toEqual([]);
    });

    it("applies cache-control headers", async () => {
      mockFindMany.mockResolvedValueOnce([]);
      const res = await buildApp().request("/changelog");
      expect(res.headers.get("cache-control")).toContain("public");
    });

    it("respects limit query parameter", async () => {
      mockFindMany.mockResolvedValueOnce([]);
      const res = await buildApp().request("/changelog?limit=50");
      expect(res.status).toBe(200);
      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    });

    it("caps limit at 500", async () => {
      mockFindMany.mockResolvedValueOnce([]);
      const res = await buildApp().request("/changelog?limit=9999");
      expect(res.status).toBe(200);
      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
    });
  });

  describe("GET /changelog/health", () => {
    it("returns ok", async () => {
      const res = await buildApp().request("/changelog/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });
});

const article = {
  id: "new",
  title: "New dashboard",
  slug: "new-dashboard",
  text: "A useful update",
  body: "## Details",
  category: "RELEASE",
  type: "FEATURE",
  version: "1.2.0",
  releaseDate: new Date("2026-10-02"),
  sortOrder: 0,
  tags: [{ tag: "dashboard" }, { tag: "api" }],
};
describe("Changelog articles and archives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGroupBy.mockResolvedValue([{ releaseDate: new Date("2026-10-02"), _count: { id: 230 } }]);
    mockCount.mockResolvedValue(230);
    mockFindMany.mockResolvedValue([article]);
    mockTags.mockResolvedValue([{ tag: "dashboard" }, { tag: "api" }]);
  });
  it("keeps full month counts while paginating more than 200 updates", async () => {
    const res = await buildApp().request("/changelog/entries?page=3&limit=100");
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({
      total: 230,
      page: 3,
      year: 2026,
      years: [2026],
      months: [{ month: "2026-10", count: 230 }],
    });
    expect(data.items[0]).toMatchObject({
      slug: "new-dashboard",
      tags: ["dashboard", "api"],
      releaseDate: "2026-10-02",
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 200,
        take: 100,
        where: expect.objectContaining({ isPublished: true }),
      }),
    );
  });
  it("uses all tag matching and the selected month, category and year", async () => {
    await buildApp().request(
      "/changelog/entries?year=2025&month=9&category=RETIRED&tag=api&tag=dashboard&match=all",
    );
    expect(mockCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        isPublished: true,
        category: "RETIRED",
        AND: [{ tags: { some: { tag: "api" } } }, { tags: { some: { tag: "dashboard" } } }],
        releaseDate: { gte: new Date("2025-09-01"), lt: new Date("2025-10-01") },
      }),
    });
    // Month headings aggregate across the whole year, independent of a selected month.
    expect(mockGroupBy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          releaseDate: { gte: new Date("2025-01-01"), lt: new Date("2026-01-01") },
        }),
      }),
    );
  });
  it("uses any matching and clamps an out-of-range page to available results", async () => {
    await buildApp().request("/changelog/entries?page=999&tag=api&tag=dashboard");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 200,
        where: expect.objectContaining({ tags: { some: { tag: { in: ["api", "dashboard"] } } } }),
      }),
    );
  });
  it.each(["category=bogus", "year=0", "month=13", "page=NaN", "tag=invalid%20tag", "match=no"])(
    "rejects invalid filters: %s",
    async (query) => {
      const res = await buildApp().request(`/changelog/entries?${query}`);
      expect(res.status).toBe(400);
      expect(mockFindMany).not.toHaveBeenCalled();
    },
  );
  it("returns 404 for absent or unpublished articles", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await buildApp().request("/changelog/entries/private-draft");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isPublished: true, OR: [{ slug: "private-draft" }] } }),
    );
  });
  it("serves Markdown articles with related published updates", async () => {
    mockFindFirst.mockResolvedValue(article);
    const res = await buildApp().request("/changelog/entries/new-dashboard");
    expect(res.status).toBe(200);
    expect((await res.json()).data.entry.body).toBe("## Details");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isPublished: true, id: { not: "new" } }),
      }),
    );
  });
  it("provides stable links and content for legacy entries", async () => {
    mockFindFirst.mockResolvedValue({ ...article, title: null, slug: null, body: null, tags: [] });
    const res = await buildApp().request("/changelog/entries/update-new");
    expect((await res.json()).data.entry).toMatchObject({
      title: article.text,
      slug: "update-new",
      body: article.text,
    });
  });
  it("returns only published updates for the RSS source", async () => {
    const res = await buildApp().request("/changelog/feed");
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isPublished: true }, take: 50 }),
    );
    expect((await res.json()).data.items[0].slug).toBe("new-dashboard");
  });
  it("serves published RSS as XML and escapes catalog text", async () => {
    mockFindMany.mockResolvedValue([{ ...article, title: "<unsafe> & title", text: "A & B" }]);
    const res = await buildApp().request("/changelog/rss");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    expect(res.headers.get("cache-control")).toContain("public, max-age=60");
    const xml = await res.text();
    expect(xml).toContain("&lt;unsafe&gt; &amp; title");
    expect(xml).toContain("A &amp; B");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isPublished: true }, take: 50 }));
  });
});
