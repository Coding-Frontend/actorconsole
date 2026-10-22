import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const browser = await chromium.launch({ headless: true });
const errors = [];

async function fixture(width = 400) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const actor = {
      userId: "sample-user", name: "Sample ActorConsole User", username: "actor-builder",
      email: "sample@example.com", image: null, expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    window.__sidebarFixture = { actor, verified: true, stored: true, apify: null, pending: null, result: null, cookieAllowed: true, removedCookiePermission: false, deferNextState: false, releaseState: null, logoutError: null, verificationError: null, messages: [], onMessage: null };
    window.chrome = {
      runtime: {
        sendMessage: async (message) => {
          const state = window.__sidebarFixture;
          state.messages.push(message);
          if (message.type === "UNPAIR") {
            if (state.logoutError) return { ok: false, error: state.logoutError };
            state.verified = false;
            state.stored = false;
            return { ok: true };
          }
          const response = {
            ok: true, pending: state.pending, result: state.result, account: state.apify, cachedAccount: null,
            actorConsoleAccount: state.verified ? state.actor : null,
            actorConsoleError: state.verificationError,
            storedActorConsoleAccount: state.stored ? state.actor : null,
            pairingStored: state.stored, workspaces: [], workspaceError: null,
          };
          if (message.type === "GET_STATE" && state.deferNextState) {
            state.deferNextState = false;
            return new Promise((resolve) => { state.releaseState = () => resolve(response); });
          }
          return response;
        },
        onMessage: { addListener: (handler) => { window.__sidebarFixture.onMessage = handler; } },
      },
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      },
      tabs: { query: async () => [], create: async () => {}, update: async () => {} },
      permissions: {
        request: async () => window.__sidebarFixture.cookieAllowed,
        remove: async () => { window.__sidebarFixture.removedCookiePermission = true; return true; },
      },
      cookies: { getAll: async () => [{ name: "ApifyRT", value: "fixture-refresh-cookie", domain: ".apify.com", path: "/", secure: true, httpOnly: true, session: true }] },
    };
  });
  await page.route("https://actorconsole.com/**", async (route) => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (!/^(sidepanel\.(html|css|js)|react-flow\.css|icon-(96|192)\.png)$/.test(name)) {
      await route.abort(); return;
    }
    const type = name.endsWith(".html") ? "text/html" : name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : "image/png";
    await route.fulfill({ contentType: type, body: await readFile(join(distDir, name)) });
  });
  await page.goto("https://actorconsole.com/sidepanel.html");
  await page.locator("#actorconsole-name").waitFor({ state: "visible" });
  return page;
}

async function refresh(page) {
  await page.evaluate(() => window.__sidebarFixture.onMessage({ type: "PAIR_CHANGED" }));
}

async function assertVisibleAccount(page) {
  for (const id of ["actorconsole-name", "actorconsole-email", "unpair-actorconsole"]) {
    if (!(await page.locator(`#${id}`).isVisible())) throw new Error(`${id} is hidden in the current view`);
  }
  const account = await page.locator(".account-session").boundingBox();
  if (!account || account.y + account.height > 350) throw new Error("Account controls are below the initial viewport");
}

try {
  for (const width of [320, 400, 676]) {
    const page = await fixture(width);
    await assertVisibleAccount(page);
    if ((await page.locator(".account-details").getAttribute("open")) !== null) throw new Error("Apify details were opened to expose the ActorConsole account");
    await page.locator(".domains summary").click();
    if ((await page.locator("#cookie-status").textContent()) !== "Not checked") throw new Error("Cookie status claims an unrequested check");
    if ((await page.locator("#backend-status").textContent()) !== "Not detected") throw new Error("Missing session status is misleading");
    const rows = await page.locator(".domain-row").evaluateAll((elements) => elements.map((row) => {
      const label = row.querySelector("strong").getBoundingClientRect();
      const status = row.querySelector("dd").getBoundingClientRect();
      return { labelY: label.y, statusY: status.y, right: status.right };
    }));
    if (rows.some((row) => Math.abs(row.labelY - row.statusY) > 2) || rows.some((row) => Math.abs(row.right - rows[0].right) > 1)) throw new Error("Diagnostic label and status columns are misaligned");
    if (process.env.EXTENSION_VISUAL_DIR) {
      await mkdir(process.env.EXTENSION_VISUAL_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.EXTENSION_VISUAL_DIR, `sidebar-account-${width}.png`), fullPage: true });
    }
    await page.locator("#view-graph").click();
    await assertVisibleAccount(page);
    if (width === 400 && process.env.EXTENSION_VISUAL_DIR) await page.screenshot({ path: join(process.env.EXTENSION_VISUAL_DIR, "sidebar-account-map.png"), fullPage: true });
    await page.locator("#unpair-actorconsole").click();
    await page.locator("#welcome-screen").waitFor({ state: "visible" });
    const loggedOut = await page.evaluate(() => !window.__sidebarFixture.stored && window.__sidebarFixture.messages.some((message) => message.type === "UNPAIR"));
    if (!loggedOut || !(await page.locator("#pair-actorconsole").isVisible())) throw new Error("Signing out did not return to sign-in");
    await page.close();
  }

  for (const mode of ["box", "graph"]) {
    const page = await fixture(320);
    if (mode === "graph") await page.locator("#view-graph").click();
    // Hold an old snapshot until after the registration refresh. It must not
    // erase the pending connection when it eventually returns.
    await page.evaluate(() => {
      window.__sidebarFixture.deferNextState = true;
      window.__sidebarFixture.onMessage({ type: "PAIR_CHANGED" });
    });
    await page.waitForFunction(() => Boolean(window.__sidebarFixture.releaseState));
    await page.evaluate(() => {
      const state = window.__sidebarFixture;
      state.apify = {
        userId: "apifyUser123", selectedAccountId: "apifyUser123", username: "apify-user",
        displayName: "Apify User", organizations: [], organizationsStatus: "ready",
        observedAt: new Date().toISOString(), sourceOrigin: "console", viewedUserId: null, selectionManual: false,
      };
      state.pending = {
        handoffId: "handoff-1", expiresAt: new Date(Date.now() + 300_000).toISOString(),
        workspace: { id: "workspace-1", name: "Primary workspace" },
        account: { id: "apifyUser123", type: "PERSONAL" },
      };
      state.onMessage({ type: "REGISTER_HANDOFF" });
    });
    await page.locator("#connect").waitFor({ state: "visible" });
    await page.evaluate(() => window.__sidebarFixture.releaseState());
    await page.waitForFunction(() => !document.getElementById("connect").hidden && document.getElementById("workspace").textContent === "Primary workspace");
    const approval = await page.locator("#connect").boundingBox();
    if (!approval || approval.y < 0 || approval.y + approval.height > 600) throw new Error(`${mode}: cookie approval is below the initial viewport`);
    if (process.env.EXTENSION_VISUAL_DIR) await page.screenshot({ path: join(process.env.EXTENSION_VISUAL_DIR, `sidebar-cookie-approval-${mode}.png`) });
    await page.evaluate(() => { window.__sidebarFixture.cookieAllowed = false; });
    await page.locator("#connect").click();
    await page.getByText("Cookie access was not approved.", { exact: true }).waitFor({ state: "visible" });
    if (!(await page.locator("#connect").isEnabled())) throw new Error("Denied cookie permission prevented retry");
    await page.evaluate(() => { window.__sidebarFixture.cookieAllowed = true; });
    await page.locator("#connect").click();
    await page.getByText("Validating session", { exact: true }).waitFor({ state: "visible" });
    const delivered = await page.evaluate(() => {
      const state = window.__sidebarFixture;
      return state.removedCookiePermission && state.messages.some((message) =>
        message.type === "DELIVER_COOKIE" && message.expectedApifyUserId === "apifyUser123" && message.apifyRt === "fixture-refresh-cookie");
    });
    if (!delivered) throw new Error("Cookie was not delivered or temporary permission was not removed");
    await page.evaluate(() => {
      const state = window.__sidebarFixture;
      state.pending = null;
      state.result = { handoffId: "handoff-1", ok: true, message: "Console credential replaced" };
      state.onMessage({ type: "ACTORCONSOLE_APIFY_HANDOFF_RESULT", payload: state.result });
    });
    await page.getByText("Console credential replaced", { exact: true }).waitFor({ state: "visible" });
    if (await page.locator("#connect").isVisible()) throw new Error("Cookie approval remained visible after completion");
    await page.close();
  }

  const page = await fixture();
  await page.evaluate(() => {
    window.__sidebarFixture.actor = { ...window.__sidebarFixture.actor, username: null, name: "A long account name that needs to wrap inside a narrow Chrome sidebar", email: "a-long-sample-email-address-for-layout-testing@example.com" };
  });
  await refresh(page);
  await page.waitForFunction(() => document.getElementById("actorconsole-username").hidden);
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Account text overflows the sidebar");
  await page.evaluate(() => { window.__sidebarFixture.logoutError = "Could not revoke this sign-in. Try again."; });
  await page.locator("#unpair-actorconsole").click();
  await page.getByText("Could not revoke this sign-in. Try again.", { exact: true }).waitFor({ state: "visible" });
  await assertVisibleAccount(page);
  await page.evaluate(() => {
    window.__sidebarFixture.verified = false;
    window.__sidebarFixture.verificationError = "Could not reach ActorConsole. Check your internet connection and retry.";
  });
  await refresh(page);
  await page.locator("#welcome-saved-account").waitFor({ state: "visible" });
  if (!(await page.locator("#welcome-unpair").isVisible())) throw new Error("Unverified saved sign-in has no sign-out action");
  await page.getByText("Could not reach ActorConsole. Check your internet connection and retry.", { exact: true }).waitFor({ state: "visible" });
  await page.locator("#pair-actorconsole").click();
  await page.getByText("Could not reach ActorConsole. Check your internet connection and retry.", { exact: true }).waitFor({ state: "visible" });
  await page.evaluate(() => {
    window.__sidebarFixture.verified = true;
    window.__sidebarFixture.verificationError = null;
  });
  await page.locator("#pair-actorconsole").click();
  await page.locator("#connector-app").waitFor({ state: "visible" });
  const retriedWithoutRePairing = await page.evaluate(() => window.__sidebarFixture.stored && !window.__sidebarFixture.messages.some((message) => message.type === "PAIR_BEGIN"));
  if (!retriedWithoutRePairing) throw new Error("Retry replaced the existing pairing");
  await page.evaluate(() => { window.__sidebarFixture.verified = false; });
  await refresh(page);
  await page.locator("#welcome-screen").waitFor({ state: "visible" });
  await page.evaluate(() => { window.__sidebarFixture.logoutError = null; });
  await page.locator("#welcome-unpair").click();
  await page.waitForFunction(() => document.getElementById("welcome-saved-account").hidden);
  if (errors.length) throw new Error(errors.join("\n"));
  process.stdout.write("Visible account and sign-out in list/map, cookie approval above the fold, permission denial and retry, stale snapshot recovery, cookie delivery, completion, aligned diagnostics, verification errors, and saved-session recovery passed.\n");
} finally {
  await browser.close();
}
