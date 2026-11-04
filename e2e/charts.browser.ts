import { test, expect, type Page } from "@playwright/test";
import type {} from "../apps/web/test/fixtures/charts";

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", (error) => messages.push(error.message));
  await page.goto("/test/fixtures/charts.html");
  await expect(
    page.getByRole("img", { name: "Revenue and profit trend", exact: true }),
  ).toBeVisible();
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test("draws all chart surfaces and supports desktop, mobile, and theme changes", async ({
  page,
}) => {
  const canvases = page.locator("canvas");
  expect(await canvases.count()).toBeGreaterThanOrEqual(10);
  for (const canvas of await canvases.all()) {
    await canvas.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        canvas.evaluate((element) => {
          const chart = window.__chartJs.getChart(element as HTMLCanvasElement);
          return Boolean(chart && chart.width > 0 && chart.height > 0);
        }),
      )
      .toBe(true);
    expect(
      await canvas.evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        return canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height)
          .data.some((value, index) => index % 4 === 3 && value > 0);
      }),
    ).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath("desktop-light.png") });
  const trend = page.getByRole("img", { name: "Metric trend", exact: true });
  const color = await trend.evaluate(
    (element) =>
      window.__chartJs.getChart(element as HTMLCanvasElement)!.data.datasets[0]!.borderColor,
  );
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect
    .poll(() =>
      trend.evaluate(
        (element) =>
          window.__chartJs.getChart(element as HTMLCanvasElement)!.data.datasets[0]!.borderColor,
      ),
    )
    .not.toEqual(color);
  await page
    .getByRole("heading", { name: "Dashboard chart verification" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("desktop-dark.png") });
  await page.setViewportSize({ width: 375, height: 812 });
  for (const canvas of await canvases.all()) {
    await canvas.scrollIntoViewIfNeeded();
    await expect
      .poll(() => canvas.evaluate((element) => element.getBoundingClientRect().width))
      .toBeLessThanOrEqual(375);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page
    .getByRole("heading", { name: "Dashboard chart verification" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("mobile-dark.png") });
});

test("keeps captured zero bars visible and missing observations empty", async ({ page }) => {
  const canvas = page.getByRole("img", { name: /Observed users by UTC day/ });
  const bars = await canvas.evaluate((element) => {
    const chart = window.__chartJs.getChart(element as HTMLCanvasElement)!;
    return chart
      .getDatasetMeta(0)
      .data.map((bar) => bar.getProps(["height"], true).height as number);
  });
  expect(!Number.isFinite(bars[0]) || bars[0] === 0).toBe(true);
  expect(!Number.isFinite(bars[1]) || bars[1] === 0).toBe(true);
  expect(bars[2]).toBeGreaterThan(0);
  expect(bars[2]).toBeLessThanOrEqual(3);
  expect(bars[3]).toBeGreaterThan(3);
});

test("switches financial styles, reads gaps, and selects dates with the keyboard", async ({
  page,
}) => {
  const canvas = page.getByRole("img", { name: "Revenue and profit trend", exact: true });
  await canvas.focus();
  await canvas.press("ArrowRight");
  await canvas.press("ArrowRight");
  await canvas.press("ArrowRight");
  await expect(
    page.locator('[aria-live="polite"]').filter({ hasText: "Revenue: Unavailable" }),
  ).toContainText("Net profit: Unavailable");
  await canvas.press("Enter");
  await expect(page.getByLabel("Selected date")).not.toHaveText("No date selected");
  await page.getByRole("button", { name: "Advanced chart settings" }).click();
  await page.getByLabel("Chart style").selectOption("line");
  await page.getByRole("switch", { name: "Show values on the chart" }).click();
  await expect
    .poll(() =>
      canvas.evaluate(
        (element) =>
          window.__chartJs.getChart(element as HTMLCanvasElement)!.data.datasets[0]!.type,
      ),
    )
    .toBe("line");
});

test("toggles datasets, restores an empty chart, and cleans up on remount", async ({ page }) => {
  const frame = page.getByRole("group", { name: "Reliability", exact: true });
  await frame.getByRole("button", { name: "Toggle Succeeded" }).click();
  await frame.getByRole("button", { name: "Toggle Failed" }).click();
  await expect(frame.getByRole("status")).toContainText("Select at least one series");
  await frame.getByRole("button", { name: "Restore all chart series" }).click();
  await expect(frame.getByRole("img")).toBeVisible();
  await page.getByRole("button", { name: "Toggle charts" }).click();
  expect(await page.evaluate(() => Object.keys(window.__chartJs.instances).length)).toBe(0);
  await page.getByRole("button", { name: "Toggle charts" }).click();
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.__chartJs.instances).length))
    .toBeGreaterThanOrEqual(10);
});
