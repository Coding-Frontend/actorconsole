import { chromium } from "@playwright/test";
import fs from "node:fs/promises";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage();
let count = 0;
let releaseOld;
await page.route("**/*", (route) => {
  if (new URL(route.request().url()).hostname !== "127.0.0.1") return route.abort("blockedbyclient");
  return route.continue();
});
await page.route("**/api/notifications?*", async (route) => {
  const old = ++count === 1;
  if (old) await new Promise((resolve) => { releaseOld = resolve; });
  await route.fulfill({ json: { ok: true, data: { unread: old ? 1 : 2, items: [{
    id: old ? "old-workspace" : "new-workspace", type: "local.audit", title: old ? "OLD workspace notification" : "NEW workspace notification", body: "Synthetic fixture", detailHref: "/dashboard/notifications/local-audit", readAt: null, createdAt: new Date().toISOString(), source: "actorconsole",
  }] } } });
});
const origin = process.env.UI_AUDIT_ORIGIN ?? "http://127.0.0.1:4190";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("Use the disposable loopback fixture only.");
await page.goto(`${origin}/harness.html?view=notifications`);
await page.getByRole("button", { name: "Workspace notifications", exact: true }).waitFor();
await page.waitForFunction(() => true);
await page.evaluate(() => window.dispatchEvent(new Event("actorconsole:workspace-changed")));
await page.getByRole("button", { name: "2 unread workspace notifications" }).click();
await page.getByText("NEW workspace notification").waitFor();
releaseOld();
if (process.env.UI_EXPECT_FIXED === "1") await page.waitForTimeout(200);
else await page.getByText("OLD workspace notification").waitFor();
const result = { snapshot: process.env.UI_AUDIT_SNAPSHOT ?? "fc52f547286b14de2f483899b4aa5dcdfca8b5ea", requestCount: count, newerResponseFirst: true, oldResponseOverwroteNew: await page.getByText("OLD workspace notification").isVisible(), newResponseStillVisible: await page.getByText("NEW workspace notification").count() > 0 };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
await fs.writeFile(process.env.UI_AUDIT_OUTPUT ?? "/tmp/ui-ux-notification-race.json", `${JSON.stringify(result, null, 2)}\n`);
await browser.close();
process.exitCode = process.env.UI_EXPECT_FIXED === "1" ? (result.oldResponseOverwroteNew || !result.newResponseStillVisible ? 1 : 0) : (result.oldResponseOverwroteNew ? 1 : 0);
