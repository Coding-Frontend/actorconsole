import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();

vi.mock("@actorconsole/db", () => ({
  db: {
    faqItem: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("../../src/lib/analytics.js", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@actorconsole/shared", () => ({
  getLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import { faqRoutes } from "../../src/routes/faq.js";

function buildApp() {
  const app = new Hono();
  app.route("/faq", faqRoutes);
  return app;
}

describe("FAQ routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /faq/", () => {
    it("returns FAQ items grouped by category", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: "f1", question: "What is this?", answer: "A platform.", category: "General" },
        { id: "f2", question: "How much?", answer: "$10/mo.", category: "Pricing" },
        { id: "f3", question: "Is there a free tier?", answer: "Yes.", category: "Pricing" },
      ]);

      const res = await buildApp().request("/faq");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.groups).toHaveLength(2);
      expect(body.data.groups[0].category).toBe("General");
      expect(body.data.groups[0].items).toHaveLength(1);
      expect(body.data.groups[1].category).toBe("Pricing");
      expect(body.data.groups[1].items).toHaveLength(2);
    });

    it("returns empty groups when no items exist", async () => {
      mockFindMany.mockResolvedValueOnce([]);
      const res = await buildApp().request("/faq");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.groups).toEqual([]);
    });

    it("applies cache-control headers", async () => {
      mockFindMany.mockResolvedValueOnce([]);
      const res = await buildApp().request("/faq");
      expect(res.headers.get("cache-control")).toContain("public");
    });
  });

  describe("GET /faq/pricing", () => {
    it("returns only pricing FAQ items", async () => {
      mockFindMany.mockResolvedValueOnce([{ id: "f2", question: "How much?", answer: "$10/mo." }]);

      const res = await buildApp().request("/faq/pricing");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
    });

    it("returns empty array when no pricing items exist", async () => {
      mockFindMany.mockResolvedValueOnce([]);
      const res = await buildApp().request("/faq/pricing");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data).toEqual([]);
    });
  });
});
