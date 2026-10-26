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

  it("escapes newlines, quotes, and backslashes without splitting samples", () => {
    const labels = { detail: 'first\n"second"\\third' };
    incrementMetric("actorconsole_test_total", labels);
    observeMetric("actorconsole_test_duration_seconds", 0.2, labels, [0.5]);

    const lines = metricsText().trimEnd().split("\n");
    expect(lines).toHaveLength(5);
    for (const line of lines) {
      expect(line).toContain('detail="first\\n\\"second\\"\\\\third"');
    }
  });

  it("exposes zero counts for configured buckets before any matching observation", () => {
    observeMetric("actorconsole_test_duration_seconds", 0.6, {}, [0.1, 0.5]);

    expect(metricsText()).toContain('actorconsole_test_duration_seconds_bucket{le="0.1"} 0');
    expect(metricsText()).toContain('actorconsole_test_duration_seconds_bucket{le="0.5"} 0');
    expect(metricsText()).toContain('actorconsole_test_duration_seconds_bucket{le="+Inf"} 1');
  });

  it("keeps buckets in numeric order across high then low observations", () => {
    observeMetric("actorconsole_test_duration_seconds", 20, {}, [10, 0.1, 2]);
    observeMetric("actorconsole_test_duration_seconds", 0.05, {}, [10, 0.1, 2]);

    const buckets = metricsText().trimEnd().split("\n").filter((line) => line.includes("_bucket{"));
    expect(buckets).toEqual([
      'actorconsole_test_duration_seconds_bucket{le="0.1"} 1',
      'actorconsole_test_duration_seconds_bucket{le="2"} 1',
      'actorconsole_test_duration_seconds_bucket{le="10"} 1',
      'actorconsole_test_duration_seconds_bucket{le="+Inf"} 2',
    ]);
  });
});
