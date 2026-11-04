import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChartJsChart } from "./chartjs-chart";
import type { ChartJsChartProps } from "./chartjs-types";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("./load-chart-renderer", () => ({ loadChartRenderer: mocks.load }));

function Renderer<T extends object>(props: ChartJsChartProps<T>) {
  return (
    <canvas
      role="img"
      aria-label={props.ariaLabel}
      data-values={JSON.stringify(props.data)}
      tabIndex={0}
    />
  );
}
const props = {
  ariaLabel: "Daily revenue",
  data: [{ day: "2026-11-01", value: 3 }],
  xKey: "day" as const,
  series: [{ key: "value", label: "Revenue", color: "blue" }],
  height: 240,
};
let observers: Array<{ visible: (visible: boolean) => void; disconnect: ReturnType<typeof vi.fn> }>;
beforeEach(() => {
  observers = [];
  mocks.load.mockReset().mockResolvedValue(Renderer);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(callback: IntersectionObserverCallback) {
        observers.push({
          visible: (isIntersecting) =>
            callback(
              [{ isIntersecting } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            ),
          disconnect: this.disconnect,
        });
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("lazy chart loading", () => {
  it("does not load offscreen charts and reserves their size before activating once", async () => {
    const view = render(<ChartJsChart {...props} />);
    const frame = view.container.firstElementChild as HTMLElement;
    expect(frame.style.height).toBe("240px");
    expect(frame.dataset.chartState).toBe("deferred");
    expect(mocks.load).not.toHaveBeenCalled();
    act(() => observers[0]!.visible(false));
    expect(mocks.load).not.toHaveBeenCalled();
    act(() => observers[0]!.visible(true));
    expect(await screen.findByRole("img", { name: props.ariaLabel })).toBeTruthy();
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(frame.style.height).toBe("240px");
    act(() => observers[0]!.visible(false));
    expect(frame.dataset.chartState).toBe("ready");
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(observers[0]!.disconnect).toHaveBeenCalled();
  });

  it("uses the latest data when props change while the renderer downloads", async () => {
    let resolve!: (renderer: typeof Renderer) => void;
    mocks.load.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(<ChartJsChart {...props} />);
    act(() => observers[0]!.visible(true));
    view.rerender(<ChartJsChart {...props} data={[{ day: "2026-11-02", value: 9 }]} />);
    await act(async () => resolve(Renderer));
    expect(screen.getByRole("img").getAttribute("data-values")).toContain('"value":9');
  });

  it("offers a scoped retry after a chunk failure and restores keyboard focus", async () => {
    mocks.load.mockRejectedValueOnce(new Error("Chunk unavailable"));
    render(
      <>
        <p>Report totals remain available</p>
        <ChartJsChart {...props} />
      </>,
    );
    act(() => observers[0]!.visible(true));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Could not load this chart"),
    );
    expect(screen.getByText("Report totals remain available")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry Daily revenue" }));
    const canvas = await screen.findByRole("img", { name: props.ariaLabel });
    await waitFor(() => expect(document.activeElement).toBe(canvas));
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it("lets users explicitly load a deferred chart with the keyboard control", async () => {
    render(<ChartJsChart {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Load Daily revenue" }));
    expect(await screen.findByRole("img", { name: props.ariaLabel })).toBeTruthy();
  });

  it("loads in browsers without IntersectionObserver", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<ChartJsChart {...props} />);
    expect(await screen.findByRole("img", { name: props.ariaLabel })).toBeTruthy();
  });

  it("ignores a pending result after unmounting", async () => {
    let resolve!: (renderer: typeof Renderer) => void;
    mocks.load.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(<ChartJsChart {...props} />);
    act(() => observers[0]!.visible(true));
    view.unmount();
    await act(async () => resolve(Renderer));
    expect(screen.queryByRole("img")).toBeNull();
    expect(observers[0]!.disconnect).toHaveBeenCalled();
  });

  it("exposes retry if the download takes too long", () => {
    vi.useFakeTimers();
    mocks.load.mockReturnValue(new Promise(() => {}));
    render(<ChartJsChart {...props} />);
    act(() => observers[0]!.visible(true));
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.getByRole("button", { name: "Retry Daily revenue" })).toBeTruthy();
  });
});
