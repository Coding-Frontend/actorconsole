import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { incrementMetric, resetMetrics } from "@actorconsole/shared";
import { metricsRoutes } from "../../src/routes/metrics.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalToken = process.env.METRICS_TOKEN;

function buildApp() {
  const app = new Hono();
  app.route("/metrics", metricsRoutes);
  return app;
}

describe("GET /metrics", () => {
  afterEach(() => {
    resetMetrics();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalToken === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = originalToken;
  });

  it("serves metrics in non-production without a token", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.METRICS_TOKEN;
    incrementMetric("actorconsole_test_total", { source: "unit" });
    const res = await buildApp().request("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toContain("actorconsole_test_total");
  });

  it("requires and timing-safely checks the production token", async () => {
    process.env.NODE_ENV = "production";
    process.env.METRICS_TOKEN = "metrics-secret";
    expect((await buildApp().request("/metrics")).status).toBe(401);
    expect(
      (await buildApp().request("/metrics", { headers: { authorization: "Bearer metrics-secret" } })).status,
    ).toBe(200);
    expect(
      (await buildApp().request("/metrics", { headers: { authorization: "Bearer wrong" } })).status,
    ).toBe(401);
  });
});
