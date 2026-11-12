// Replay of the recorded inline browser check; no new application behavior is implemented.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 320, height: 640 } });
const output = { snapshot: "fc52f547286b14de2f483899b4aa5dcdfca8b5ea", origin: "http://127.0.0.1:4191", errors: [], widths: [] };
page.on("pageerror", (error) => output.errors.push(error.message));
await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort("blockedbyclient"));
output.docsStatus = (await page.goto(`${output.origin}/docs/first-workspace`)).status();
await page.getByRole("navigation", { name: "Breadcrumb" }).waitFor();
await page.evaluate(() => document.fonts.ready);
for (const width of [320, 375, 768, 1024, 1440]) {
  await page.setViewportSize({ width, height: 800 });
  output.widths.push(await page.getByRole("button", { name: "Search docs", exact: true }).evaluate((e) => ({ width: innerWidth, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right, clipped: e.getBoundingClientRect().right > innerWidth, bodyScrollWidth: document.body.scrollWidth, font: getComputedStyle(document.body).fontFamily })));
}
await page.setViewportSize({ width: 320, height: 640 });
await page.getByRole("button", { name: "Open menu", exact: true }).click();
output.mobileInitialFocusInside = await page.getByRole("dialog", { name: "Menu", exact: true }).evaluate((e) => e.contains(document.activeElement));
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(400);
output.marketingResizeOverflow = await page.evaluate(() => getComputedStyle(document.body).overflowY);
const payloads = [];
await page.route("**/api/auth/local/login", async (route) => {
  payloads.push(route.request().postDataJSON());
  await route.fulfill({ json: { ok: true, requiresTwoFactor: true, challengeToken: "disposable-challenge" } });
});
output.loginStatus = (await page.goto(`${output.origin}/login`)).status();
await page.getByLabel("Email", { exact: true }).fill("audit@example.com");
await page.getByLabel("Password", { exact: true }).fill("disposable-password");
await page.getByRole("button", { name: "Sign in with email" }).click();
await page.getByLabel("Authenticator code").fill("123456");
await page.getByLabel("Authenticator code").press("Enter");
await page.waitForTimeout(100);
output.twoFactor = { requestCount: payloads.length, secondRequestKeys: Object.keys(payloads[1] ?? {}), hasCode: Boolean(payloads[1]?.totpCode) };
await fs.writeFile("/tmp/ui-ux-real-baseline.json", `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
await browser.close();
