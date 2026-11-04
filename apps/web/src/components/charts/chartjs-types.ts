import type { ChartDisplayState, ChartSeriesDefinition } from "./chart-system";

export type ChartJsSeries = ChartSeriesDefinition & {
  type?: "line" | "area" | "bar";
  axisId?: string;
  stack?: string;
  dashed?: boolean;
  pointRadius?: number;
  colorKey?: string;
  fillOpacity?: number;
  minBarLength?: number;
  maxBarThickness?: number;
  dataLabelFormatter?: (value: number) => string;
};

export type ValueAxis = {
  formatValue?: (value: number) => string;
  min?: number;
  max?: number;
  integer?: boolean;
  hidden?: boolean;
  position?: "left" | "right";
  beginAtZero?: boolean;
};

export type ChartJsChartProps<T extends object> = {
  ariaLabel: string;
  data: readonly T[];
  xKey: keyof T & string;
  series: readonly ChartJsSeries[];
  type?: "line" | "area" | "bar";
  state?: ChartDisplayState;
  horizontal?: boolean;
  height?: number;
  className?: string;
  xLabelFormatter?: (label: string, index: number) => string;
  tooltipTitle?: (point: T, index: number) => string;
  yAxis?: ValueAxis;
  additionalAxes?: Record<string, ValueAxis>;
  showDataLabels?: boolean;
  selectedIndex?: number;
  selectedColor?: string;
  onSelect?: (index: number) => void;
};
