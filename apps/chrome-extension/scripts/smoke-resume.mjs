import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => process.stderr.write(`Apify fixture page error: ${error.message}\n`));
  await page.addInitScript({ path: join(distDir, "apify-resume-main.js") });
  await page.addInitScript(() => {
    window.__observedSessions = [];
    window.addEventListener("message", (event) => {
      if (event.data?.source === "actorconsole-apify-resume") {
        window.__observedSessions.push(event.data);
      }
    });
  });
  await page.route("https://console.apify.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: [
        "<script>",
        'const url = "https://console-backend.apify.com/public/authentication/resume";',
        'fetch(url, { method: "POST", credentials: "include", body: JSON.stringify({ viewedUserId: "organization123" }) });',
        "const xhr = new XMLHttpRequest();",
        'xhr.open("POST", url);',
        'xhr.send(JSON.stringify({ viewedUserId: "organization123" }));',
        "</script>",
      ].join(""),
    }),
  );
  await page.route(
    "https://console-backend.apify.com/public/authentication/resume",
    (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "https://console.apify.com",
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify({
          userId: "fixtureUser12345",
          uiToken: "apify_ui_" + "a".repeat(32),
        }),
      }),
  );
  await page.goto("https://console.apify.com/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__observedSessions?.length >= 2, undefined, { timeout: 5_000 });
  const sessions = await page.evaluate(() => window.__observedSessions);
  if (
    sessions.some(
      (message) =>
        message.type !== "APIFY_SESSION_DETECTED" ||
        message.payload?.userId !== "fixtureUser12345" ||
        message.payload?.viewedUserId !== "organization123",
    )
  ) {
    throw new Error("The resume response was not captured from both fetch and XHR.");
  }
  process.stdout.write("Resume interception passed.\n");

  const panel = await browser.newPage();
  panel.on("pageerror", (error) => process.stderr.write(`Sidebar fixture page error: ${error.message}\n`));
  await panel.addInitScript(() => {
    window.__tabNavigation = { updated: [], created: [] };
    window.__runtimeMessages = [];
    window.chrome = {
      runtime: {
        sendMessage: async (message) => {
          window.__runtimeMessages.push(message);
          if (message.type === "CHECK_WORKSPACE_CONNECTION") {
            const confirmed = message.workspaceId === "workspace-1";
            return { ok: true, check: {
              checkedAt: new Date().toISOString(), confirmed,
              api: confirmed ? "MISSING" : "ERROR", console: confirmed ? "VALID" : "ERROR",
              accountAccess: confirmed ? "VALID" : "UNVERIFIED", message: "Fixture connection check",
            } };
          }
          return {
          ok: true,
          pending: null,
          result: null,
          actorConsoleAccount: {
            userId: "actorconsole-user-1",
            name: "Sample ActorConsole User",
            username: "actor-builder",
            email: "sample@example.com",
            image: null,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
          pairingStored: true,
          workspaces: [
            {
              id: "workspace-1",
              name: "Team workspace",
              connection: "MATCHED",
              connectedAccountId: "organization123",
              apifyUsername: "sample-organization",
              apiKeyConfigured: false,
              apiTokenStatus: "NOT_CONFIGURED",
              uiTokenConfigured: false,
              uiTokenStatus: "NOT_CONFIGURED",
              browserSessionConfigured: true,
              browserSessionStatus: "VALID",
            },
            {
              id: "workspace-2",
              name: "Personal workspace",
              connection: "OTHER_ACCOUNT",
              connectedAccountId: "fixtureUser12345",
              apifyUsername: "sample-builder",
              apiKeyConfigured: true,
              apiTokenStatus: "INVALID",
              uiTokenConfigured: false,
              uiTokenStatus: "NOT_CONFIGURED",
              browserSessionConfigured: false,
              browserSessionStatus: "NOT_CONFIGURED",
            },
          ],
          workspaceError: null,
          account: {
            userId: "fixtureUser12345",
            username: "sample-builder",
            displayName: "Sample Builder",
            pictureUrl: null,
            observedAt: new Date().toISOString(),
            sourceOrigin: "console",
            viewedUserId: "organization123",
            selectedAccountId: "organization123",
            selectionManual: false,
            organizations: [{
              id: "organization123",
              name: "Sample organization",
              username: "sample-organization",
              pictureUrl: null,
            }],
            organizationsStatus: "ready",
          },
          };
        },
        onMessage: { addListener: () => {} },
      },
      tabs: {
        query: async () => [{ id: 42, active: true }],
        update: async (id, options) => {
          window.__tabNavigation.updated.push({ id, url: options.url });
        },
        create: async (options) => {
          window.__tabNavigation.created.push(options.url);
        },
      },
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      },
    };
  });
  await panel.route("https://actorconsole.com/sidepanel.html", async (route) =>
    route.fulfill({ contentType: "text/html", body: await readFile(join(distDir, "sidepanel.html")) }),
  );
  await panel.route("https://actorconsole.com/sidepanel.js", async (route) =>
    route.fulfill({ contentType: "application/javascript", body: await readFile(join(distDir, "sidepanel.js")) }),
  );
  await panel.route("https://actorconsole.com/sidepanel.css", async (route) =>
    route.fulfill({ contentType: "text/css", body: await readFile(join(distDir, "sidepanel.css")) }),
  );
  await panel.route("https://actorconsole.com/react-flow.css", async (route) =>
    route.fulfill({ contentType: "text/css", body: await readFile(join(distDir, "react-flow.css")) }),
  );
  await panel.route("https://actorconsole.com/icon-96.png", async (route) =>
    route.fulfill({ contentType: "image/png", body: await readFile(join(distDir, "icon-96.png")) }),
  );
  await panel.goto("https://actorconsole.com/sidepanel.html");
  await panel.locator("#workspaces-list .workspace-choice").first().waitFor({ state: "visible", timeout: 5_000 });
  process.stdout.write("Sidebar state rendered.\n");
  if (!(await panel.locator("#unpair-actorconsole").isVisible())) {
    throw new Error("The signed-in account has no visible sign-out action.");
  }
  if ((await panel.locator("#actorconsole-name").textContent()) !== "Sample ActorConsole User") {
    throw new Error("The sidebar did not display the paired ActorConsole account.");
  }
  await panel.locator(".account-details summary").click();
  if ((await panel.locator("#account-name").textContent()) !== "Sample Builder") {
    throw new Error("The sidebar did not display the detected Apify account.");
  }
  await panel.locator(".account-details summary").click();
  await panel.waitForFunction(() => document.querySelector("#workspaces-list")?.textContent.includes("Console verified · API key needed"), undefined, { timeout: 5_000 }).catch(async () => {
    throw new Error(`Connection checks did not finish: ${await panel.locator("#workspaces-list").textContent()}; messages: ${JSON.stringify(await panel.evaluate(() => window.__runtimeMessages))}`);
  });
  const workspaceCopy = await panel.locator("#workspaces-list").textContent();
  if (!workspaceCopy.includes("Saved link · Sample organization") ||
      !workspaceCopy.includes("Connection needs attention") ||
      workspaceCopy.includes("another Apify account")) {
    throw new Error("The sidebar did not show the saved accounts and connection status.");
  }
  await panel.locator("#workspaces-list .workspace-manage").first().click();
  await panel.locator("#connection-dialog").waitFor({ state: "visible" });
  if ((await panel.locator("#box-connection-status").textContent()) !== "API key needed" ||
      !(await panel.locator("#box-import-api-key.connection-primary-button").isVisible()) ||
      !(await panel.locator("#box-check-action.connection-recheck-button").isVisible()) ||
      (await panel.locator("#box-primary-actions button:visible").count()) !== 1) {
    throw new Error("The connection dialog did not show one clear API key action and a compact recheck control.");
  }
  if (process.env.EXTENSION_VISUAL_DIR) {
    await mkdir(process.env.EXTENSION_VISUAL_DIR, { recursive: true });
    await panel.setViewportSize({ width: 400, height: 820 });
    await panel.screenshot({ path: join(process.env.EXTENSION_VISUAL_DIR, "connection-dialog-api-key.png"), fullPage: true });
    await panel.setViewportSize({ width: 320, height: 640 });
    await panel.screenshot({ path: join(process.env.EXTENSION_VISUAL_DIR, "connection-dialog-small.png"), fullPage: true });
    await panel.setViewportSize({ width: 1280, height: 720 });
  }
  await panel.locator("#box-more-actions summary").click();
  if (!(await panel.locator("#box-refresh-action").isVisible()) ||
      !(await panel.locator("#box-settings-action").isVisible()) ||
      !(await panel.locator("#box-disconnect-action").isVisible())) {
    throw new Error("The connection dialog did not preserve refresh, manual key, and disconnect actions.");
  }
  await panel.locator("#close-connection-dialog").click();
  await panel.locator("#workspaces-list .workspace-manage").nth(1).click();
  if (!(await panel.locator("#box-refresh-action.connection-primary-button").isVisible())) {
    throw new Error("An expired Console session did not make reconnection the main action.");
  }
  await panel.locator("#close-connection-dialog").click();
  process.stdout.write("Workspace connection dialog passed.\n");
  await panel.locator("#view-graph").click();
  await panel.locator(".connection-flow-root .flow-node--workspace").first().waitFor({ state: "visible" });
  if ((await panel.locator(".react-flow__controls-button").count()) !== 3) {
    throw new Error("The graph did not render zoom in, zoom out, and fit-view controls.");
  }
  const branchPath = await panel.locator(".react-flow__edge.flow-edge--actor .react-flow__edge-path").first().getAttribute("d");
  if (!branchPath?.includes("C")) {
    throw new Error("The connection map did not render curved edges.");
  }
  await panel.locator(".flow-node--workspace .flow-node-heading").first().click();
  const workspaceNavigation = await panel.evaluate(() => window.__runtimeMessages.at(-1));
  if (workspaceNavigation?.type !== "OPEN_WORKSPACE_SETTINGS" || !workspaceNavigation.workspaceId) {
    throw new Error("The workspace graph node did not request its ActorConsole settings page.");
  }
  await panel.locator(".flow-node--apify .flow-node-heading").click();
  const navigation = await panel.evaluate(() => window.__tabNavigation);
  if (navigation.created.length || navigation.updated.length !== 1 ||
      navigation.updated[0].id !== 42 ||
      navigation.updated[0].url !== "https://console.apify.com/organization/organization123") {
    throw new Error("The Apify graph node did not navigate the current tab to the selected organization.");
  }
  await panel.locator(".react-flow__edge.flow-edge--connection .react-flow__edge-path").first().dispatchEvent("click");
  await panel.locator("#connection-dialog").waitFor({ state: "visible" });
  if ((await panel.locator(".graph-inspector").count()) !== 0) {
    throw new Error("The graph still shows an inline inspector below its nodes.");
  }
  await panel.locator("#close-connection-dialog").click();
  if (process.env.EXTENSION_VISUAL_DIR) {
    await mkdir(process.env.EXTENSION_VISUAL_DIR, { recursive: true });
    await panel.setViewportSize({ width: 400, height: 820 });
    await panel.screenshot({ path: join(process.env.EXTENSION_VISUAL_DIR, "connection-flow-narrow.png"), fullPage: true });
    await panel.setViewportSize({ width: 1000, height: 820 });
    await panel.screenshot({ path: join(process.env.EXTENSION_VISUAL_DIR, "connection-flow-wide.png"), fullPage: true });
  }
  await panel.locator(".domains summary").click();
  if ((await panel.locator("#console-status").textContent()) !== "Observed" ||
      (await panel.locator("#backend-status").textContent()) !== "Resume succeeded" ||
      (await panel.locator("#cookie-status").textContent()) !== "Not checked") {
    throw new Error("The session diagnostic states are incorrect.");
  }
  await panel.locator(".domains summary").click();
  process.stdout.write("Resume fetch/XHR capture, account display, and both dialog flows passed.\n");
} finally {
  await browser.close();
}
