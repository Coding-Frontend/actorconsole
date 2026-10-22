import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditActorSeo } from "@actorconsole/shared/actor-intelligence";

const mocks = vi.hoisted(() => ({ downloadCsv: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
vi.mock("./tool-actions", () => ({ downloadCsv: mocks.downloadCsv, CopyText: () => null }));
import { PricingTool, SeoTool } from "./research-tools";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = new URLSearchParams();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function metric(label: string) {
  return screen.getByText(label, { selector: "dt" }).parentElement!.querySelector("dd")!
    .textContent;
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
const auditData = {
  ...auditActorSeo({ title: "Short", description: "Brief description" }),
  name: "owner/actor",
  sourceUrl: "https://apify.com/owner/actor",
  auditedAt: "2026-10-04T10:00:00.000Z",
};
function startAudit() {
  change("Public Actor", "owner/actor");
  fireEvent.click(screen.getByRole("button", { name: "Audit listing" }));
}

describe("pricing calculator", () => {
  it("recalculates every metric from workload inputs and resets the example", () => {
    render(<PricingTool />);
    expect(metric("Estimated profit")).toBe("$38.00");
    change("Price per 1,000 results (USD)", "10");
    change("Billable results", "2000");
    change("Apify cost for this workload (USD)", "5");
    change("Other costs for this workload (USD)", "3");
    expect(metric("Gross revenue")).toBe("$20.00");
    expect(metric("Total costs")).toBe("$8.00");
    expect(metric("Estimated profit")).toBe("$12.00");
    expect(metric("Profit margin")).toBe("60.0%");
    expect(metric("Break-even price / 1,000")).toBe("$4.00");
    fireEvent.click(screen.getByRole("button", { name: "Reset example" }));
    expect(metric("Estimated profit")).toBe("$38.00");
    expect((screen.getByLabelText("Billable results") as HTMLInputElement).value).toBe("10000");
  });

  it.each([
    ["Billable results", "1.5", "Billable results must be a whole number."],
    ["Billable results", "1000000001", "Enter a value of 1,000,000,000 or less."],
    ["Apify cost for this workload (USD)", "-1", "Enter a non-negative number."],
    ["Price per 1,000 results (USD)", "", "Enter a value. Use 0 if there is no cost or volume."],
    ["Price per 1,000 results (USD)", "0.0000001", "Use 0 or an amount of at least $0.000001."],
  ])("blocks invalid %s value %s and recovers after correction", (label, value, message) => {
    render(<PricingTool />);
    change(label, value);
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(screen.getByLabelText(label).getAttribute("aria-invalid")).toBe("true");
    expect(
      (screen.getByRole("button", { name: "Export scenario" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByText("Estimated profit", { selector: "dt" })).toBeNull();
    change(label, "5");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Export scenario" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("keeps zero volume and zero revenue explicit without undefined or infinite values", () => {
    render(<PricingTool />);
    change("Billable results", "0");
    expect(metric("Gross revenue")).toBe("$0.00");
    expect(metric("Estimated profit")).toBe("-$12.00");
    expect(metric("Profit margin")).toBe("No revenue");
    expect(metric("Break-even price / 1,000")).toBe("No results");
    change("Billable results", "10000");
    change("Price per 1,000 results (USD)", "0");
    expect(metric("Profit margin")).toBe("No revenue");
    expect(metric("Break-even price / 1,000")).toBe("$1.20");
    expect(screen.getByText(/Costs exceed revenue by/).textContent).toContain("$12.00");
  });

  it("supports small prices without rounding them to zero and exports the current loss", () => {
    render(<PricingTool />);
    change("Price per 1,000 results (USD)", "0.000001");
    change("Billable results", "1000");
    expect(metric("Gross revenue")).toBe("$0.000001");
    fireEvent.click(screen.getByRole("button", { name: "Export scenario" }));
    const [filename, rows] = mocks.downloadCsv.mock.calls[0];
    expect(filename).toBe("actor-pricing-scenario.csv");
    expect(rows).toContainEqual(["Gross revenue (USD)", 0.000001, "estimate"]);
    expect(rows).toContainEqual(["Estimated profit (USD)", -11.999999, "estimate"]);
  });
});

describe("SEO audit", () => {
  it("prefills research links, renders an audit, filters unavailable checks, and exports", async () => {
    mocks.params = new URLSearchParams("actor=owner%2Factor");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: auditData })));
    vi.stubGlobal("fetch", fetchMock);
    render(<SeoTool />);
    expect((screen.getByLabelText("Public Actor") as HTMLInputElement).value).toBe("owner/actor");
    fireEvent.click(screen.getByRole("button", { name: "Audit listing" }));
    await screen.findByRole("heading", { name: "owner/actor" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/public/seo?actor=owner%2Factor");
    expect(screen.getByText("3 of 5 checks assessed")).toBeTruthy();
    const checks = screen.getByRole("region", { name: "Listing checks" });
    fireEvent.click(screen.getByRole("button", { name: "Unavailable 2" }));
    expect(within(checks).getAllByRole("listitem")).toHaveLength(2);
    expect(within(checks).queryByRole("heading", { name: "Search title" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Passed 0" }));
    expect(within(checks).getByText(/No checks in this category/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All checks 5" }));
    expect(within(checks).getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Export audit" }));
    expect(mocks.downloadCsv.mock.calls[0][1]).toContainEqual([
      "Usage documentation",
      "Unavailable",
      auditData.checks[3].detail,
      "owner/actor",
    ]);
  });

  it("shows an actionable API error and permits a successful retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "Check the Actor name and try again." }), {
            status: 404,
          }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: auditData }))),
    );
    render(<SeoTool />);
    startAudit();
    expect((await screen.findByRole("alert")).textContent).toContain("Check the Actor name");
    fireEvent.click(screen.getByRole("button", { name: "Audit listing" }));
    await screen.findByRole("heading", { name: "owner/actor" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows loading, prevents duplicate submissions, and aborts on unmount", async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<SeoTool />);
    startAudit();
    expect(screen.getByRole("status").textContent).toContain("Reading the public listing");
    expect((screen.getByLabelText("Public Actor") as HTMLInputElement).disabled).toBe(true);
    fireEvent.submit(screen.getByLabelText("Public Actor").closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.unmount();
    await waitFor(() => expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true));
  });

  it("recovers from a timeout with a retry action", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    render(<SeoTool />);
    startAudit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole("alert").textContent).toContain("took too long to load");
    expect(
      (screen.getByRole("button", { name: "Audit listing" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("handles an incomplete response instead of rendering a broken result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }))));
    render(<SeoTool />);
    startAudit();
    expect((await screen.findByRole("alert")).textContent).toContain("incomplete response");
    expect(screen.queryByRole("heading", { name: "Listing checks" })).toBeNull();
  });
});
