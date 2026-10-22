import { afterEach, describe, expect, it } from "vitest";
import { incrementMetric, metricsText, observeMetric, resetMetrics } from "./metrics.js";

describe("Prometheus metrics", () => {
  afterEach(() => resetMetrics());

  it("renders counters with normalized, escaped labels", () => {
    incrementMetric("actorconsole_test_total", { route: "/actors/:id", method: "GET" }, 2);
    incrementMetric("actorconsole_test_total", { route: "/actors/:id", method: "GET" });
    const output = metricsText();
    expect(output).toContain('actorconsole_test_total{method="GET",route="/actors/:id"} 3');
  });

  it("renders cumulative histogram buckets, count, and sum", () => {
    observeMetric("actorconsole_test_duration_seconds", 0.2, { route: "/health" }, [0.1, 0.5]);
    observeMetric("actorconsole_test_duration_seconds", 0.6, { route: "/health" }, [0.1, 0.5]);
    const output = metricsText();
    expect(output).toContain('actorconsole_test_duration_seconds_count{route="/health"} 2');
    expect(output).toContain('actorconsole_test_duration_seconds_sum{route="/health"} 0.8');
    expect(output).toContain('actorconsole_test_duration_seconds_bucket{route="/health",le="0.5"} 1');
    expect(output).toContain('actorconsole_test_duration_seconds_bucket{route="/health",le="+Inf"} 2');
  });
});
