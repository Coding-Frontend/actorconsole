import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindManyIncidents = vi.fn();

vi.mock("@actorconsole/db", () => ({
  db: {
    incident: {
      findMany: (...args: unknown[]) => mockFindManyIncidents(...args),
    },
  },
}));

vi.mock("../../src/lib/analytics.js", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../../src/lib/queue.js", () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock("@actorconsole/shared", () => ({
  getLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import { statusRoutes } from "../../src/routes/status.js";

function buildApp() {
  const app = new Hono();
  app.route("/status", statusRoutes);
  return app;
}

describe("Status routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /status/", () => {
    it("returns operational status when no active incidents", async () => {
      mockFindManyIncidents.mockResolvedValueOnce([]);
      mockFindManyIncidents.mockResolvedValueOnce([]);

      const res = await buildApp().request("/status");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.status).toBe("operational");
      expect(body.data.activeIncidents).toBe(0);
    });

    it("returns degraded status when active incidents exist", async () => {
      mockFindManyIncidents.mockResolvedValueOnce([
        { id: "i1", status: "investigating", title: "DB outage" },
      ]);
      mockFindManyIncidents.mockResolvedValueOnce([]);

      const res = await buildApp().request("/status");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.status).toBe("degraded");
      expect(body.data.activeIncidents).toBe(1);
    });

    it("returns services array", async () => {
      mockFindManyIncidents.mockResolvedValueOnce([]);
      mockFindManyIncidents.mockResolvedValueOnce([]);

      const res = await buildApp().request("/status");
      const body = await res.json();
      expect(body.data.services).toBeDefined();
      expect(body.data.services.length).toBeGreaterThan(0);
      expect(body.data.services[0]).toHaveProperty("name");
      expect(body.data.services[0]).toHaveProperty("status");
    });
  });

  describe("GET /status/incidents", () => {
    it("returns incidents list", async () => {
      mockFindManyIncidents.mockResolvedValueOnce([
        { id: "i1", status: "resolved", title: "Past incident" },
      ]);

      const res = await buildApp().request("/status/incidents");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
    });

    it("respects limit query parameter", async () => {
      mockFindManyIncidents.mockResolvedValueOnce([]);
      const res = await buildApp().request("/status/incidents?limit=5");
      expect(res.status).toBe(200);
      expect(mockFindManyIncidents).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });

    it("caps limit at 50", async () => {
      mockFindManyIncidents.mockResolvedValueOnce([]);
      const res = await buildApp().request("/status/incidents?limit=999");
      expect(res.status).toBe(200);
      expect(mockFindManyIncidents).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    });
  });
});
