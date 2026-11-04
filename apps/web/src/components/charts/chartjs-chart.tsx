"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { loadChartRenderer } from "./load-chart-renderer";
import type { ChartJsRenderer } from "./chartjs-renderer";
import type { ChartJsChartProps } from "./chartjs-types";
export type { ChartJsChartProps, ChartJsSeries } from "./chartjs-types";

/** Keep chart code and canvas work off the initial render until the plot is near view. */
export function ChartJsChart<T extends object>(props: ChartJsChartProps<T>) {
  const container = useRef<HTMLDivElement>(null);
  const focusOnLoad = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [Renderer, setRenderer] = useState<typeof ChartJsRenderer | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (enabled) return;
    if (typeof IntersectionObserver === "undefined") {
      setEnabled(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setEnabled(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const timeout = setTimeout(() => {
      if (current) setError(true);
    }, 15_000);
    void loadChartRenderer()
      .then((renderer) => {
        if (!current) return;
        clearTimeout(timeout);
        setError(false);
        setRenderer(() => renderer);
      })
      .catch(() => {
        clearTimeout(timeout);
        if (current) setError(true);
      });
    return () => {
      current = false;
      clearTimeout(timeout);
    };
  }, [enabled, attempt]);

  useEffect(() => {
    if (Renderer && focusOnLoad.current) {
      container.current?.querySelector("canvas")?.focus();
      focusOnLoad.current = false;
    }
  }, [Renderer]);

  const load = () => {
    focusOnLoad.current = true;
    setError(false);
    setEnabled(true);
    setAttempt((value) => value + 1);
  };
  return (
    <div
      ref={container}
      className={cn("h-full w-0 min-w-full", props.className)}
      style={props.height ? { height: props.height } : undefined}
      aria-busy={enabled && !Renderer && !error}
      data-chart-label={props.ariaLabel}
      data-chart-state={Renderer ? "ready" : error ? "error" : enabled ? "loading" : "deferred"}
    >
      {Renderer ? (
        <Renderer {...props} />
      ) : (
        <div className="flex h-full min-h-8 items-center justify-center rounded-sm bg-muted/30 px-3 text-center text-xs text-muted-foreground">
          {error ? (
            <div role="alert" className="space-y-2">
              <p>Could not load this chart.</p>
              <button
                type="button"
                onClick={load}
                className="rounded-sm px-3 py-2 font-medium text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Retry ${props.ariaLabel}`}
              >
                Retry chart
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="ml-2 rounded-sm px-3 py-2 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Reload page
              </button>
            </div>
          ) : enabled ? (
            <span role="status" aria-label={`Loading ${props.ariaLabel}`}>
              Loading chart…
            </span>
          ) : (
            <button
              type="button"
              onClick={load}
              className="rounded-sm px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Load ${props.ariaLabel}`}
            >
              Load chart
            </button>
          )}
        </div>
      )}
    </div>
  );
}
