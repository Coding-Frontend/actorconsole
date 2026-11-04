"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
  type ChartDataset,
  type Plugin,
  type ScriptableContext,
} from "chart.js";
import { formatChartValue } from "./chart-system";
import type { ChartJsChartProps, ChartJsSeries, ValueAxis } from "./chartjs-types";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
);

type ChartType = "bar" | "line";
type ChartInstance = Chart<ChartType, (number | null)[], string>;

function field(point: object, key: string): unknown {
  return (point as Record<string, unknown>)[key];
}

function numericValue(point: object, key: string) {
  const value = field(point, key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatValue(value: number | null, series: ChartJsSeries) {
  if (value === null) return "Unavailable";
  return series.formatValue?.(value) ?? formatChartValue(value, series.format);
}

/** Resolve semantic CSS colors before passing them to the canvas API. */
function chartTheme() {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.append(probe);
  const colors = new Map<string, string>();
  const color = (value: string) => {
    const cached = colors.get(value);
    if (cached) return cached;
    probe.style.color = "";
    probe.style.color = value;
    const resolved = getComputedStyle(probe).color || "#64748b";
    colors.set(value, resolved);
    return resolved;
  };
  return {
    color,
    font: getComputedStyle(document.body).fontFamily || "sans-serif",
    dispose: () => probe.remove(),
  };
}

function configuration<T extends object>(
  props: ChartJsChartProps<T>,
): ChartConfiguration<ChartType, (number | null)[], string> {
  const theme = chartTheme();
  try {
    const { data, series, state, horizontal = false } = props;
    const labels = data.map((point) => String(field(point, props.xKey) ?? ""));
    const text = theme.color("var(--color-muted-foreground)");
    const foreground = theme.color("var(--color-foreground)");
    const border = theme.color("var(--color-border)");
    const visible = (item: ChartJsSeries) => !state || state.visibleSeries.has(item.key);
    const stacked = series.some((item) => item.stack);
    const categoryAxis = {
      type: "category" as const,
      display: state?.axisLabelsVisible ?? true,
      stacked,
      border: { display: false },
      grid: { display: false, drawTicks: false },
      ticks: {
        color: text,
        font: { family: theme.font, size: 11 },
        padding: 10,
        autoSkip: !horizontal,
        maxRotation: 0,
        minRotation: 0,
        ...(horizontal ? {} : { maxTicksLimit: 8 }),
        callback: (_value: string | number, index: number) =>
          props.xLabelFormatter?.(labels[index] ?? "", index) ?? labels[index],
      },
    };
    const valueAxis = (axis: ValueAxis = {}, secondary = false) => ({
      type: "linear" as const,
      display: !axis.hidden && (state?.axisLabelsVisible ?? true),
      position: horizontal ? ("bottom" as const) : (axis.position ?? "left"),
      beginAtZero: axis.beginAtZero ?? true,
      min: axis.min,
      max: axis.max,
      stacked,
      border: { display: false },
      grid: { color: border, lineWidth: 0.5, drawTicks: false, drawOnChartArea: !secondary },
      ticks: {
        color: text,
        font: { family: theme.font, size: 11 },
        padding: 8,
        maxTicksLimit: 6,
        ...(axis.integer ? { precision: 0 } : {}),
        callback: (value: string | number) =>
          axis.formatValue?.(Number(value)) ?? formatChartValue(Number(value), { unit: "compact" }),
      },
    });
    const datasets = series.map<ChartDataset<ChartType, (number | null)[]>>((item) => {
      const type = item.type ?? props.type ?? "line";
      const color = theme.color(item.color);
      const fillTop = theme.color(
        `color-mix(in srgb, ${color} ${(item.fillOpacity ?? 0.24) * 100}%, transparent)`,
      );
      const fillBottom = theme.color(`color-mix(in srgb, ${color} 2%, transparent)`);
      const pointColors = item.colorKey
        ? data.map((point) => theme.color(String(field(point, item.colorKey!) ?? item.color)))
        : color;
      const common = {
        label: item.label,
        data: data.map((point) => numericValue(point, item.key)),
        hidden: !visible(item),
        ...(horizontal ? { xAxisID: item.axisId ?? "x" } : { yAxisID: item.axisId ?? "y" }),
        borderColor: pointColors,
        stack: item.stack,
      };
      if (type === "bar") {
        return {
          ...common,
          type: "bar",
          backgroundColor: pointColors,
          borderWidth: 0,
          borderRadius: 3,
          borderSkipped: false,
          maxBarThickness: item.maxBarThickness ?? 44,
          // Missing observations stay null; captured zeros can have a visible marker.
          minBarLength: item.minBarLength ?? 0,
          order: 1,
        };
      }
      return {
        ...common,
        type: "line",
        borderWidth: 2,
        fill: type === "area",
        backgroundColor:
          type === "area"
            ? (context: ScriptableContext<"line">) => {
                const { ctx, chartArea } = context.chart;
                if (!chartArea) return "transparent";
                const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, fillTop);
                gradient.addColorStop(1, fillBottom);
                return gradient;
              }
            : color,
        borderDash: item.dashed ? [5, 3] : [],
        cubicInterpolationMode: "monotone" as const,
        spanGaps: false,
        pointRadius: data.map((_, index) =>
          index === props.selectedIndex ? 5 : (item.pointRadius ?? (data.length === 1 ? 3 : 0)),
        ),
        pointBackgroundColor: data.map((_, index) =>
          index === props.selectedIndex && props.selectedColor
            ? theme.color(props.selectedColor)
            : color,
        ),
        pointHoverRadius: 4,
        pointHitRadius: 10,
        order: 0,
      };
    });
    const labelsPlugin: Plugin<ChartType> = {
      id: "actorconsole-data-labels",
      afterDatasetsDraw(chart) {
        if (!(props.showDataLabels ?? state?.dataLabelsVisible)) return;
        const { ctx } = chart;
        ctx.save();
        ctx.font = `10px ${theme.font}`;
        ctx.fillStyle = foreground;
        series.forEach((item, datasetIndex) => {
          if (!chart.isDatasetVisible(datasetIndex)) return;
          chart.getDatasetMeta(datasetIndex).data.forEach((element, index) => {
            const value = numericValue(data[index]!, item.key);
            if (value === null) return;
            const label = item.dataLabelFormatter?.(value) ?? formatValue(value, item);
            if (!Number.isFinite(element.x) || !Number.isFinite(element.y)) return;
            const width = ctx.measureText(label).width;
            ctx.textAlign = "center";
            ctx.textBaseline = !horizontal && value < 0 ? "top" : "bottom";
            const x = horizontal ? element.x + (value < 0 ? -1 : 1) * (width / 2 + 6) : element.x;
            const y = horizontal
              ? element.y + 5
              : value < 0
                ? Math.min(chart.height - 12, element.y + 6)
                : Math.max(12, element.y - 6);
            ctx.fillText(label, Math.max(width / 2, Math.min(x, chart.width - width / 2)), y);
          });
        });
        ctx.restore();
      },
    };
    return {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        indexAxis: horizontal ? "y" : "x",
        interaction: { mode: "index", intersect: false, axis: horizontal ? "y" : "x" },
        layout: { padding: { top: 18, right: horizontal ? 32 : 8 } },
        scales: {
          x: horizontal ? valueAxis(props.yAxis) : categoryAxis,
          y: horizontal ? categoryAxis : valueAxis(props.yAxis),
          ...Object.fromEntries(
            Object.entries(props.additionalAxes ?? {}).map(([key, axis]) => [
              key,
              valueAxis(axis, true),
            ]),
          ),
        },
        plugins: {
          tooltip: {
            backgroundColor: theme.color("var(--color-popover)"),
            titleColor: foreground,
            bodyColor: foreground,
            borderColor: border,
            borderWidth: 1,
            padding: 12,
            titleFont: { family: theme.font, size: 12 },
            bodyFont: { family: theme.font, size: 12 },
            callbacks: {
              title: (items) => {
                const index = items[0]?.dataIndex;
                return index === undefined
                  ? ""
                  : (props.tooltipTitle?.(data[index]!, index) ?? labels[index]);
              },
              label: (context) => {
                const item = series[context.datasetIndex]!;
                return `${item.label}: ${formatValue(numericValue(data[context.dataIndex]!, item.key), item)}`;
              },
            },
          },
        },
        onClick: (_event, elements) => {
          const index = elements[0]?.index;
          if (index !== undefined) props.onSelect?.(index);
        },
      },
      plugins: [labelsPlugin],
    };
  } finally {
    theme.dispose();
  }
}

/** Shared Chart.js canvas with responsive sizing, theme updates, and keyboard inspection. */
export function ChartJsRenderer<T extends object>(props: ChartJsChartProps<T>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const latestProps = useRef(props);
  const refreshRef = useRef<(() => void) | null>(null);
  const activeIndex = useRef(0);
  const [reading, setReading] = useState("");
  const helpId = useId();

  useEffect(() => {
    latestProps.current = props;
    refreshRef.current?.();
  }, [props]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const refresh = () => {
      const config = configuration(latestProps.current);
      const chart = chartRef.current;
      if (chart) {
        chart.data = config.data;
        chart.options = config.options ?? {};
        chart.config.plugins?.splice(0, chart.config.plugins.length, ...(config.plugins ?? []));
        chart.update("none");
      } else {
        chartRef.current = new Chart(canvas, config);
      }
    };
    refreshRef.current = refresh;
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    colorScheme.addEventListener("change", refresh);
    return () => {
      observer.disconnect();
      colorScheme.removeEventListener("change", refresh);
      refreshRef.current = null;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  function inspect(index: number) {
    const point = props.data[index];
    const chart = chartRef.current;
    if (!point || !chart) return;
    activeIndex.current = index;
    const visible = props.series.filter(
      (item) => !props.state || props.state.visibleSeries.has(item.key),
    );
    const title = props.tooltipTitle?.(point, index) ?? String(field(point, props.xKey) ?? "");
    setReading(
      `${title}. ${visible.map((item) => `${item.label}: ${formatValue(numericValue(point, item.key), item)}`).join(". ")}`,
    );
    const elements = props.series.flatMap((item, datasetIndex) =>
      chart.isDatasetVisible(datasetIndex) && numericValue(point, item.key) !== null
        ? [{ datasetIndex, index }]
        : [],
    );
    chart.setActiveElements(elements);
    const element = elements[0];
    const position = element
      ? chart.getDatasetMeta(element.datasetIndex).data[index]?.tooltipPosition(true)
      : undefined;
    chart.tooltip?.setActiveElements(elements, position ?? { x: 0, y: 0 });
    chart.update("none");
  }

  return (
    <>
      <div className="relative h-full w-full">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={props.ariaLabel}
          aria-describedby={helpId}
          tabIndex={0}
          className="block max-w-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onFocus={() => inspect(Math.min(activeIndex.current, props.data.length - 1))}
          onBlur={() => {
            chartRef.current?.setActiveElements([]);
            chartRef.current?.tooltip?.setActiveElements([], { x: 0, y: 0 });
            chartRef.current?.update("none");
          }}
          onKeyDown={(event) => {
            let index = activeIndex.current;
            if (event.key === "ArrowRight" || event.key === "ArrowDown") index += 1;
            else if (event.key === "ArrowLeft" || event.key === "ArrowUp") index -= 1;
            else if (event.key === "Home") index = 0;
            else if (event.key === "End") index = props.data.length - 1;
            else if ((event.key === "Enter" || event.key === " ") && props.onSelect) {
              event.preventDefault();
              props.onSelect(index);
              return;
            } else return;
            event.preventDefault();
            inspect(Math.max(0, Math.min(index, props.data.length - 1)));
          }}
        >
          {props.ariaLabel}. Use the chart’s exact values to read the source data.
        </canvas>
      </div>
      <p id={helpId} className="sr-only">
        Use arrow keys to inspect values, and Home or End to jump to the first or last observation.
        {props.onSelect ? " Press Enter to select an observation." : ""}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {reading}
      </p>
    </>
  );
}
