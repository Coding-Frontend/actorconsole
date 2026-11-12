import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort("blockedbyclient"));
await page.goto("http://127.0.0.1:4188/harness.html");
const checks = [];
for (const width of [320, 375, 767, 1023]) {
  await page.setViewportSize({ width, height: 640 });
  const opener = page.getByRole("button", { name: "Open menu", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Main menu" });
  await expect(dialog).toBeVisible();
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let n = 0; n < 12; n++) {
      await page.keyboard.press(key);
      assert.ok(await dialog.evaluate((element) => element.contains(document.activeElement)), `${key} escaped at ${width}px`);
    }
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await dialog.waitFor();
  // Radix defers its outside-pointer listener until after opening.
  await page.waitForTimeout(100);
  await page.mouse.click(5, 100);
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflowY)).not.toBe("hidden");
  checks.push({ width, forwardAndReverseFocusContained: true, escapeRestoresOpener: true, backdropRestoresOpener: true, resizeUnlocks: true });
}
const colors = [];
const paletteOpener = page.getByRole("button", { name: "Open command palette" });
await paletteOpener.click();
await expect(page.getByRole("combobox")).toBeFocused();
await page.keyboard.press("Escape");
await expect(page.getByRole("dialog")).toHaveCount(0);
await expect(paletteOpener).toBeFocused();
for (const theme of ["light", "dark"]) {
  await page.evaluate((mode) => document.documentElement.classList.toggle("dark", mode === "dark"), theme);
  const button = page.getByRole("button", { name: "Send Message" });
  for (const state of ["normal", "hover", "focus"]) {
    await page.mouse.move(0, 0);
    if (state === "hover") await button.hover();
    if (state === "focus") await button.focus();
    await page.waitForTimeout(200);
    const measured = await button.evaluate((element) => {
      const parse = (value) => { const parts = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return [parts[0], parts[1], parts[2], parts[3] ?? 1]; };
      const blend = (front, back) => front.slice(0, 3).map((channel, i) => channel * front[3] + back[i] * (1 - front[3]));
      const background = (node) => node ? blend(parse(getComputedStyle(node).backgroundColor), background(node.parentElement)) : [255, 255, 255];
      const bg = background(element);
      const fg = blend(parse(getComputedStyle(element).color), bg);
      const luminance = (rgb) => rgb.map((value) => { value /= 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
      const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      return { foreground: fg, background: bg, ratio: (values[0] + 0.05) / (values[1] + 0.05) };
    });
    assert.ok(measured.ratio >= 4.5, `${theme}/${state} contrast ${measured.ratio}`);
    colors.push({ theme, state, ...measured });
  }
}
await browser.close();
const result = { checks, colors, passed: true };
await fs.writeFile("/tmp/ui-implementation-navigation.json", `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
