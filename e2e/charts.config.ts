import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "charts.browser.ts",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8091",
    ...devices["Desktop Chrome"],
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node support/charts-server.mjs",
    url: "http://127.0.0.1:8091/test/fixtures/charts.html",
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
});
