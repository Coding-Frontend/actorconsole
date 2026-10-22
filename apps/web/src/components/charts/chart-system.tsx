"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Maximize2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type ChartStatus = "ready" | "loading" | "empty" | "error";

export type ChartValueFormat = {
  unit?: "number" | "compact" | "currency" | "percent";
  currency?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
};

export type ChartValueFormatter = (value: number) => string;

export type ChartSeriesDefinition = {
  key: string;
  label: string;
  color: string;
  format?: ChartValueFormat;
  formatValue?: ChartValueFormatter;
};

export type ChartDisplayState = {
  visibleSeries: ReadonlySet<string>;
  axisLabelsVisible: boolean;
  dataLabelsVisible: boolean;
};

export type ChartFrameOptions = {
  /** Show interactive legend controls when more than one series is available. */
  showSeriesControls?: boolean;
  /** Allow the user to hide both x- and y-axis labels. */
  allowAxisLabels?: boolean;
  /** Allow consumers to render Recharts labels from the shared state. */
  allowDataLabels?: boolean;
  defaultAxisLabelsVisible?: boolean;
  defaultDataLabelsVisible?: boolean;
  /** Use shorter option copy for dense dashboards and small charts. */
  compact?: boolean;
};

type ChartFrameProps = {
  ariaLabel: string;
  series: readonly ChartSeriesDefinition[];
  children: (state: ChartDisplayState) => ReactNode;
  status?: ChartStatus;
  statusMessage?: string;
  options?: ChartFrameOptions;
  className?: string;
  chartClassName?: string;
};

type ChartLegendProps = {
  series: readonly ChartSeriesDefinition[];
  visibleSeries: ReadonlySet<string>;
  interactive: boolean;
  onToggle: (key: string) => void;
  onShowOnly: (key: string) => void;
  onShowAll: () => void;
};

type ChartOptionsProps = {
  options: ChartFrameOptions;
  axisLabelsVisible: boolean;
  dataLabelsVisible: boolean;
  onAxisLabelsChange: (visible: boolean) => void;
  onDataLabelsChange: (visible: boolean) => void;
};

export type ChartTooltipPayloadItem<TData = unknown> = {
  color?: string;
  dataKey?: string | number;
  name?: string | number;
  value?: unknown;
  payload?: TData;
};

export type ChartTooltipProps<TData = unknown> = {
  active?: boolean;
  label?: ReactNode;
  payload?: readonly ChartTooltipPayloadItem<TData>[];
  series?: readonly ChartSeriesDefinition[];
  labelFormatter?: (
    label: ReactNode,
    payload: readonly ChartTooltipPayloadItem<TData>[],
  ) => ReactNode;
};

const DEFAULT_CURRENCY = "USD";

/**
 * Shared chart frame for all Recharts surfaces.
 *
 * Recharts still owns the actual SVG primitives, while this component owns
 * the application-level contract: keyboard-accessible series controls,
 * focus-one/restore-all behavior, independent label visibility, and common
 * loading/empty/error presentation.
 */
export function ChartFrame({
  ariaLabel,
  series,
  children,
  status = "ready",
  statusMessage,
  options,
  className,
  chartClassName,
}: ChartFrameProps) {
  const seriesKeySignature = series.map((item) => item.key).join("\u0000");
  const seriesKeys = useMemo(
    () => (seriesKeySignature ? seriesKeySignature.split("\u0000") : []),
    [seriesKeySignature],
  );
  const controls = {
    showSeriesControls: options?.showSeriesControls ?? series.length > 1,
    allowAxisLabels: options?.allowAxisLabels ?? true,
    allowDataLabels: options?.allowDataLabels ?? true,
    compact: options?.compact ?? false,
  };
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(() => new Set(seriesKeys));
  const [axisLabelsVisible, setAxisLabelsVisible] = useState(
    options?.defaultAxisLabelsVisible ?? true,
  );
  const [dataLabelsVisible, setDataLabelsVisible] = useState(
    options?.defaultDataLabelsVisible ?? false,
  );

  useEffect(() => {
    setVisibleSeries(new Set(seriesKeys));
  }, [seriesKeySignature, seriesKeys]);

  const toggleSeries = (key: string) => {
    setVisibleSeries((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const showOnly = (key: string) => setVisibleSeries(new Set([key]));
  const showAll = () => setVisibleSeries(new Set(seriesKeys));
  const chartState: ChartDisplayState = {
    visibleSeries,
    axisLabelsVisible,
    dataLabelsVisible,
  };

  return (
    <div className={cn("min-w-0", className)} role="group" aria-label={ariaLabel}>
      {status === "ready" && series.length ? (
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
          {controls.showSeriesControls ? (
            <ChartLegend
              series={series}
              visibleSeries={visibleSeries}
              interactive={controls.showSeriesControls}
              onToggle={toggleSeries}
              onShowOnly={showOnly}
              onShowAll={showAll}
            />
          ) : null}
          {controls.allowAxisLabels || controls.allowDataLabels ? (
            <ChartOptions
              options={controls}
              axisLabelsVisible={axisLabelsVisible}
              dataLabelsVisible={dataLabelsVisible}
              onAxisLabelsChange={setAxisLabelsVisible}
              onDataLabelsChange={setDataLabelsVisible}
            />
          ) : null}
        </div>
      ) : null}
      {status !== "ready" ? (
        <ChartStateMessage status={status} message={statusMessage} />
      ) : visibleSeries.size === 0 ? (
        <ChartStateMessage
          status="empty"
          message="Select at least one series to display this chart."
        />
      ) : (
        <div className={cn("relative min-w-0", chartClassName)}>{children(chartState)}</div>
      )}
    </div>
  );
}

function ChartLegend({
  series,
  visibleSeries,
  interactive,
  onToggle,
  onShowOnly,
  onShowAll,
}: ChartLegendProps) {
  const hasHiddenSeries = series.some((item) => !visibleSeries.has(item.key));

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1.5"
      role="list"
      aria-label="Chart series"
    >
      {series.map((item) => {
        const visible = visibleSeries.has(item.key);
        return (
          <div
            key={item.key}
            className="group/series inline-flex items-center gap-0.5"
            role="listitem"
          >
            <button
              type="button"
              className={cn(
                "focus-visible:ring-ring inline-flex min-w-0 items-center gap-1.5 rounded-sm border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2",
                visible
                  ? "border-border bg-card text-foreground"
                  : "bg-muted/40 text-muted-foreground border-transparent line-through",
              )}
              aria-label={interactive ? `Toggle ${item.label}` : item.label}
              aria-pressed={visible}
              onClick={() => (interactive ? onToggle(item.key) : undefined)}
              disabled={!interactive}
              title={interactive ? `Toggle ${item.label}` : item.label}
            >
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", !visible && "opacity-35")}
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="max-w-[15rem] truncate">{item.label}</span>
            </button>
            {interactive ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-6 w-6 items-center justify-center rounded-sm opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 group-hover/series:opacity-100"
                aria-label={`Show only ${item.label}`}
                title={`Show only ${item.label}`}
                onClick={() => onShowOnly(item.key)}
              >
                <Maximize2 className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        );
      })}
      {interactive && hasHiddenSeries ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onShowAll}
          aria-label="Restore all chart series"
          title="Restore all chart series"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          All
        </Button>
      ) : null}
    </div>
  );
}

function ChartOptions({
  options,
  axisLabelsVisible,
  dataLabelsVisible,
  onAxisLabelsChange,
  onDataLabelsChange,
}: ChartOptionsProps) {
  const id = useId();
  const hasOptions = options.allowAxisLabels || options.allowDataLabels;
  if (!hasOptions) return null;

  return (
    <details className="relative shrink-0">
      <summary className="workbench-control text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm border border-transparent px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{options.compact ? "Options" : "Chart options"}</span>
      </summary>
      <div className="border-border bg-popover text-popover-foreground absolute right-0 z-20 mt-1 grid min-w-48 gap-2 rounded-sm border p-3 shadow-lg">
        {options.allowAxisLabels ? (
          <label className="flex items-center justify-between gap-4 text-xs" htmlFor={`${id}-axis`}>
            <span>Axis labels</span>
            <Switch
              id={`${id}-axis`}
              checked={axisLabelsVisible}
              onCheckedChange={onAxisLabelsChange}
              aria-label="Show axis labels"
            />
          </label>
        ) : null}
        {options.allowDataLabels ? (
          <label className="flex items-center justify-between gap-4 text-xs" htmlFor={`${id}-data`}>
            <span>Data labels</span>
            <Switch
              id={`${id}-data`}
              checked={dataLabelsVisible}
              onCheckedChange={onDataLabelsChange}
              aria-label="Show data labels"
            />
          </label>
        ) : null}
      </div>
    </details>
  );
}

function ChartStateMessage({
  status,
  message,
}: {
  status: Exclude<ChartStatus, "ready">;
  message?: string;
}) {
  const defaultMessage =
    status === "loading"
      ? "Loading chart data…"
      : status === "error"
        ? "Chart data could not be loaded."
        : "No chart data is available for this scope.";
  return (
    <div
      className="border-border text-muted-foreground flex min-h-48 items-center justify-center rounded-sm border border-dashed px-6 text-center text-sm"
      role={status === "error" ? "alert" : "status"}
    >
      {message ?? defaultMessage}
    </div>
  );
}

export function formatChartValue(
  value: number | null | undefined,
  format: ChartValueFormat = { unit: "number" },
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const unit = format.unit ?? "number";
  if (unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: format.currency ?? DEFAULT_CURRENCY,
      maximumFractionDigits: format.maximumFractionDigits ?? 2,
      minimumFractionDigits: format.minimumFractionDigits ?? 2,
    }).format(value);
  }
  if (unit === "percent") {
    return `${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: format.maximumFractionDigits ?? 1,
      minimumFractionDigits: format.minimumFractionDigits ?? 0,
    }).format(value)}%`;
  }
  return new Intl.NumberFormat("en-US", {
    notation: unit === "compact" ? "compact" : "standard",
    maximumFractionDigits: format.maximumFractionDigits ?? (unit === "compact" ? 1 : 2),
    minimumFractionDigits: format.minimumFractionDigits ?? 0,
  }).format(value);
}

export function ChartTooltip<TData = unknown>({
  active,
  label,
  payload,
  series = [],
  labelFormatter,
}: ChartTooltipProps<TData>) {
  if (!active || !payload?.length) return null;
  const visiblePayload = payload.filter(
    (item) => item.dataKey !== undefined || item.name !== undefined,
  );
  if (!visiblePayload.length) return null;
  const resolvedLabel = labelFormatter ? labelFormatter(label, payload) : label;

  return (
    <div className="border-border bg-popover text-popover-foreground min-w-36 rounded-sm border p-3 text-xs shadow-lg">
      {resolvedLabel !== undefined && resolvedLabel !== null ? (
        <p className="text-muted-foreground mb-2 font-medium">{resolvedLabel}</p>
      ) : null}
      <div className="grid gap-1.5">
        {visiblePayload.map((item, index) => {
          const definition = series.find(
            (candidate) =>
              candidate.key === String(item.dataKey) || candidate.label === String(item.name),
          );
          const numericValue =
            typeof item.value === "number"
              ? item.value
              : typeof item.value === "string" && item.value.trim()
                ? Number(item.value)
                : null;
          const formatted = definition?.formatValue
            ? numericValue != null && Number.isFinite(numericValue)
              ? definition.formatValue(numericValue)
              : "—"
            : formatChartValue(numericValue, definition?.format);
          return (
            <div
              key={`${String(item.dataKey ?? item.name)}-${index}`}
              className="flex items-center justify-between gap-5"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color ?? definition?.color ?? "currentColor" }}
                  aria-hidden="true"
                />
                <span className="truncate">{definition?.label ?? item.name ?? item.dataKey}</span>
              </span>
              <span className="shrink-0 font-mono tabular-nums">{formatted}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
