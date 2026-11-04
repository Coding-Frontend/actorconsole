import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

const mailbox = process.env.E2E_MAILBOX_URL;
if (!mailbox)
  throw new Error("Authenticated E2E requires the local email inbox. Run pnpm test:e2e:launch.");
const password = "E2E-password-Only-2026!";
test.setTimeout(60_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "actorconsole.cookie-consent",
      JSON.stringify({ version: 1, choice: "essential", timestamp: Date.now() }),
    ),
  );
});

async function emailCode(request: APIRequestContext, email: string, subject: string) {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${mailbox}/messages`, { params: { email } });
        const messages = (await response.json()) as Array<{ subject: string; code: string }>;
        code = messages.filter((message) => message.subject.includes(subject)).at(-1)?.code;
        return code;
      },
      { message: "The real authentication email must arrive at the local SMTP inbox" },
    )
    .toMatch(/^\d{6}$/);
  return code!;
}

async function signup(page: Page) {
  const email = `browser-${randomUUID()}@example.test`;
  await page.goto("/signup");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const create = page.getByRole("button", { name: "Create account", exact: true });
  await expect(create).toBeDisabled();
  await page.getByRole("checkbox", { name: /I agree/ }).check();
  await create.click();
  await expect(page).toHaveURL(/\/signup\/verify-email/);
  await page
    .getByLabel("Verification code", { exact: true })
    .fill(await emailCode(page.request, email, "Verify"));
  await page.getByRole("button", { name: /Verify email|Verify and continue/i }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/onboarding)?(?:\?|$)/, { timeout: 20_000 });
  await expect
    .poll(async () => (await page.request.get("/api/account/profile")).status())
    .toBe(200);
  return email;
}

async function login(page: Page, email: string, currentPassword = password) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(currentPassword);
  await page.getByRole("button", { name: "Sign in with email", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/onboarding)?(?:\?|$)/);
}

test("signup, verification, workspace creation, Apify connection, and signout", async ({
  page,
}) => {
  const email = await signup(page);
  await page.goto("/dashboard/onboarding");
  await page.getByLabel("Workspace name", { exact: true }).fill("Browser launch workspace");
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/account/business-profiles") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  const creation = await created;
  expect(creation.status()).toBe(201);
  const profiles = await (await page.request.get("/api/account/business-profiles")).json();
  const workspace = profiles.data.find(
    (profile: { id: string; name: string }) => profile.name === "Browser launch workspace",
  );
  expect(workspace?.id).toBeTruthy();
  await page
    .getByLabel("Apify API key", { exact: false })
    .fill("apify_api_e2e_local_only_1234567890");
  const connected = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/apify/connect") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  expect((await connected).ok()).toBe(true);
  await page.getByRole("button", { name: /Continue with (current plan|Free)/ }).click();
  await expect(page).not.toHaveURL(/\/onboarding/);
  const status = await (await page.request.get("/api/apify/status")).json();
  expect(status.data.apiKeyConfigured).toBe(true);
  expect(status.data.username).toBe("e2e-builder");
  expect(JSON.stringify(status)).not.toContain("apify_api_e2e_local_only");
  const other = await page.request.post("/api/account/business-profiles", {
    data: { name: "Separate workspace" },
  });
  expect(other.status()).toBe(201);
  expect((await (await page.request.get("/api/apify/status")).json()).data.connected).toBe(false);
  expect(
    (await page.request.post(`/api/account/business-profiles/${workspace.id}/select`)).ok(),
  ).toBe(true);
  expect((await (await page.request.get("/api/apify/status")).json()).data.apiKeyConfigured).toBe(
    true,
  );
  const cookie = (await page.context().cookies()).find((item) =>
    item.name.endsWith("authjs.session-token"),
  );
  expect(cookie?.httpOnly).toBe(true);
  await page.getByRole("button", { name: /Profile & account/ }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login|\/$/);
  expect((await page.request.get("/api/account/profile")).status()).toBe(401);
  await login(page, email);
  expect((await (await page.request.get("/api/account/profile")).json()).data.email).toBe(email);
});

test("password reset consumes the emailed code and revokes existing sessions", async ({
  page,
  browser,
}) => {
  const email = await signup(page);
  const recovery = await browser.newContext();
  const resetPage = await recovery.newPage();
  try {
    await resetPage.goto("/forgot-password");
    await resetPage.getByLabel("Email", { exact: true }).fill(email);
    await resetPage.getByRole("button", { name: "Send reset code", exact: true }).click();
    const code = await emailCode(page.request, email, "Reset");
    await resetPage.getByLabel("Reset code", { exact: true }).fill(code);
    const newPassword = `${password}-changed`;
    await resetPage.getByLabel("New password", { exact: true }).fill(newPassword);
    await resetPage.getByRole("button", { name: "Set new password", exact: true }).click();
    await expect(resetPage).toHaveURL(/\/login/);
    expect((await page.request.get("/api/account/profile")).status()).toBe(401);
    expect(
      (
        await resetPage.request.post("/api/auth/local/reset-password", {
          data: { email, code, password },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await resetPage.request.post("/api/auth/local/login", { data: { email, password } })
      ).status(),
    ).toBe(401);
    await login(resetPage, email, newPassword);
  } finally {
    await recovery.close();
  }
});

test("workspace isolation rejects another user's selection, updates, and forged scope", async ({
  page,
  browser,
}) => {
  await signup(page);
  const owned = await page.request.post("/api/account/business-profiles", {
    data: { name: "Private owner workspace" },
  });
  expect(owned.status()).toBe(201);
  const workspace = (await owned.json()).data;
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  try {
    await signup(strangerPage);
    const own = await strangerPage.request.post("/api/account/business-profiles", {
      data: { name: "Stranger workspace" },
    });
    expect(own.status()).toBe(201);
    const select = await strangerPage.request.post(
      `/api/account/business-profiles/${workspace.id}/select`,
    );
    expect(select.status()).toBe(404);
    const update = await strangerPage.request.patch(
      `/api/account/business-profiles/${workspace.id}`,
      { data: { name: "Unauthorized change" } },
    );
    expect(update.status()).toBe(404);
    const forged = await strangerPage.request.get("/api/account/workspace-access", {
      headers: { "x-business-profile-id": workspace.id },
    });
    expect((await forged.json()).data.workspaceId).toBe((await own.json()).data.id);
    expect(
      JSON.stringify(
        await (await strangerPage.request.get("/api/account/business-profiles")).json(),
      ),
    ).not.toContain(workspace.id);
  } finally {
    await stranger.close();
  }
});

test("anonymous and cross-origin callers cannot access private account operations", async ({
  page,
}) => {
  expect((await page.request.get("/api/account/profile")).status()).toBe(401);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  const response = await page.request.post("/api/auth/local/login", {
    headers: { origin: "https://untrusted.example" },
    data: { email: "anyone@example.test", password },
  });
  expect(response.status()).toBe(403);
});

test("concurrent registrations each commit a verification code and deliver email", async ({
  request,
}) => {
  const emails = Array.from({ length: 4 }, () => `concurrent-${randomUUID()}@example.test`);
  const responses = await Promise.all(
    emails.map((email) =>
      request.post("/api/auth/local/register", { data: { email, password, termsAccepted: true } }),
    ),
  );
  expect(responses.map((response) => response.status())).toEqual([200, 200, 200, 200]);
  await Promise.all(emails.map((email) => emailCode(request, email, "Verify")));
});
