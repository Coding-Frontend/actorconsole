import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const audit = {
  name: "owner/actor",
  sourceUrl: "https://apify.com/owner/actor",
  title: "Business contact data extractor",
  description:
    "Find businesses and export structured contact details for research and sales workflows.",
  auditedAt: "2026-10-04T10:00:00.000Z",
  score: 67,
  assessedChecks: 3,
  disclaimer: "Editorial checks, not an Apify ranking prediction.",
  checks: [
    { label: "Search title", passed: true, detail: "31 characters; aim for 20–60." },
    { label: "Search description", passed: true, detail: "85 characters; aim for 80–160." },
    {
      label: "Clear description",
      passed: false,
      detail: "Explain the data returned and a concrete use case.",
    },
    {
      label: "Usage documentation",
      passed: null,
      detail:
        "The public source did not return README content. Review documentation on the Actor page.",
    },
    {
      label: "Structured documentation",
      passed: null,
      detail: "README content is unavailable from this source; this check was not scored.",
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.goto("/tools/pricing");
  const consent = page.getByRole("button", { name: "Essential only", exact: true });
  await consent.click();
});

test("calculator recalculates, rejects fractional volume, resets, and downloads numeric losses", async ({
  page,
}) => {
  const scenario = page.getByRole("region", { name: "Pricing scenario" });
  await expect(scenario.getByText("$38.00", { exact: true })).toBeVisible();
  await page.getByLabel("Price per 1,000 results (USD)").fill("10");
  await expect(scenario.getByText("$88.00", { exact: true })).toBeVisible();
  await page.getByLabel("Billable results", { exact: true }).fill("1.5");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Billable results must be a whole number.",
  );
  await expect(page.getByRole("button", { name: "Export scenario" })).toBeDisabled();
  await page.getByRole("button", { name: "Reset example" }).click();
  await page.getByLabel("Price per 1,000 results (USD)").fill("0");
  await expect(scenario.getByText("-$12.00", { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export scenario" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("actor-pricing-scenario.csv");
  expect(await readFile((await download.path())!, "utf8")).toContain(
    '"Estimated profit (USD)",-12,"estimate"',
  );
});

test("SEO audit loads, filters recommendations, and exports", async ({ page }) => {
  await page.route("**/api/public/seo?*", (route) => route.fulfill({ json: { data: audit } }));
  await page.goto("/tools/seo?actor=owner%2Factor");
  await expect(page.getByLabel("Public Actor", { exact: true })).toHaveValue("owner/actor");
  await page.getByRole("button", { name: "Audit listing" }).click();
  await expect(page.getByRole("heading", { name: "owner/actor", exact: true })).toBeVisible();
  const checks = page.getByRole("region", { name: "Listing checks" });
  await page.getByRole("button", { name: "Needs attention 1", exact: true }).click();
  await expect(checks.getByRole("listitem")).toHaveCount(1);
  await expect(checks.getByRole("heading", { name: "Clear description" })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export audit" }).click();
  expect((await downloaded).suggestedFilename()).toBe("actor-seo-audit.csv");
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`tools and footer fit ${viewport.name} in light and dark themes`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await page.route("**/api/public/seo?*", (route) => route.fulfill({ json: { data: audit } }));
    for (const theme of ["light", "dark"]) {
      for (const tool of ["pricing", "seo"]) {
        await page.evaluate((selected) => localStorage.setItem("ac-theme", selected), theme);
        await page.goto(`/tools/${tool}`);
        await expect(page.locator("html")).toHaveAttribute(
          "class",
          theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b).*$/,
        );
        if (tool === "seo") {
          if (process.env.CAPTURE_TOOL_SCREENSHOTS && theme === "light")
            await page.screenshot({
              path: testInfo.outputPath(`${tool}-empty-${viewport.name}.png`),
              fullPage: true,
            });
          await page.getByLabel("Public Actor", { exact: true }).fill("owner/actor");
          await page.getByRole("button", { name: "Audit listing" }).click();
          await expect(
            page.getByRole("heading", { name: "owner/actor", exact: true }),
          ).toBeVisible();
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        const footer = page.getByRole("contentinfo");
        const tools = footer.getByRole("navigation", { name: "Tools", exact: true });
        await expect(tools.getByRole("link", { name: "SEO audit" })).toBeVisible();
        await expect(tools.getByRole("link", { name: "Pricing calculator" })).toBeVisible();
        const product = footer.getByRole("navigation", { name: "Product", exact: true });
        await expect(product.getByRole("link", { name: "SEO audit" })).toHaveCount(0);
        await expect(product.getByRole("link", { name: "Pricing", exact: true })).toBeVisible();
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await expect(page.locator("html")).toHaveAttribute(
          "class",
          theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b).*$/,
        );
        if (process.env.CAPTURE_TOOL_SCREENSHOTS) {
          await page.screenshot({
            path: testInfo.outputPath(`${tool}-${viewport.name}-${theme}.png`),
            fullPage: true,
          });
        }
      }
    }
  });
}
