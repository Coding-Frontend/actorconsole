import { test, expect } from "@playwright/test";

test.describe("public application smoke checks", () => {
  test("landing page renders a truthful product entry point", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/ActorConsole/i);
    await expect(page.getByRole("link", { name: /pricing/i }).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /get started|start for free/i }).first(),
    ).toHaveAttribute("href", "/signup");
  });

  test("public API documentation is reachable", async ({ page }) => {
    await page.goto("/docs");
    await expect(
      page.getByRole("heading", { name: /start with actorconsole/i }).first(),
    ).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);
  });
});
