// Replay of the recorded inline built-app check; all submitted data stays in browser fixtures.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
await page.addInitScript(() => localStorage.setItem("actorconsole.cookie-consent", JSON.stringify({ version: 1, choice: "essential", timestamp: Date.now() })));
await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort("blockedbyclient"));
let requests = 0, release, startedResolve;
const started = new Promise((resolve) => { startedResolve = resolve; });
await page.route("**/api/contact", async (route) => {
  requests++;
  startedResolve();
  await new Promise((resolve) => { release = resolve; });
  await route.fulfill({ json: { ok: true } });
});
const output = {};
output.status = (await page.goto("http://127.0.0.1:4191/contact")).status();
await page.getByLabel("Full Name").fill("Local Audit");
await page.getByLabel("Email Address").fill("audit@example.com");
await page.getByLabel("Message").fill("Original locally mocked message");
await page.getByRole("button", { name: "Send Message" }).click();
await started;
await page.getByLabel("Full Name").press("Enter");
await page.getByLabel("Full Name").press("Enter");
output.requestsWhilePending = requests;
output.messageEditable = await page.getByLabel("Message").isEnabled();
await page.getByLabel("Message").fill("Newer unsent draft for proof");
release();
await page.getByRole("button", { name: "Send Message" }).waitFor();
output.newDraftAfterSuccess = await page.getByLabel("Message").inputValue();
for (const theme of ["light", "dark"]) {
  await page.evaluate((mode) => document.documentElement.classList.toggle("dark", mode === "dark"), theme);
  await page.waitForTimeout(200);
  output[theme] = await page.getByRole("button", { name: "Send Message" }).evaluate((e) => ({ foreground: getComputedStyle(e).color, background: getComputedStyle(e).backgroundColor, fontSize: getComputedStyle(e).fontSize }));
}
await fs.writeFile("/tmp/ui-ux-real-contact.json", `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
await browser.close();
