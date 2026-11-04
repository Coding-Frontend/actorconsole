import type { ChartJsRenderer } from "./chartjs-renderer";

let renderer: Promise<typeof ChartJsRenderer> | undefined;

/** Share one download across charts; allow a failed chunk request to be retried. */
export function loadChartRenderer() {
  renderer ??= import("./chartjs-renderer")
    .then((module) => module.ChartJsRenderer)
    .catch((error) => {
      renderer = undefined;
      throw error;
    });
  return renderer;
}
