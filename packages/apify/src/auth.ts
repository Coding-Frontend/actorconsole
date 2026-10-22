/**
 * Per-user Apify client management. Reads the encrypted token from the
 * `ApifyToken` table, decrypts it with APP_ENCRYPTION_KEY, and returns a
 * typed `ApifyClientWrapper`. On any decryption error returns `null` so
 * the caller can show a clean "reconnect" UX.
 */

import {
  db,
  getIntegration,
  getIntegrationHealth,
  recordIntegrationTest,
  setIntegration,
} from "@actorconsole/db";
import {
  decrypt,
  encrypt,
  getLogger,
  selectActiveApifyConsoleCredential,
} from "@actorconsole/shared";
import { ApifyClientError } from "./errors";
import { createApifyClient, type ApifyClientWrapper } from "./client";
import { normalizeConsoleCookies, normalizeConsoleUiToken } from "./credentials";

const log = getLogger("apify:auth");

export const APIFY_ACCOUNT_MISMATCH_CODE = "APIFY_ACCOUNT_MISMATCH";

export interface ApifyAccountMatchResult {
  matches: boolean | null;
  apiUsername: string | null;
  consoleUserId: string | null;
  message: string | null;
}

export interface ApifyAccountIdentity {
  id: string;
  username: string;
  name: string | null;
  displayName: string;
  url: string;
}

type WorkspaceCredential = "api" | "ui" | "cookies";
type CredentialStatus = "EXPIRED" | "INVALID" | "ERROR";

function statusForCredentialError(
  error: ApifyClientError,
  authentication: boolean,
): CredentialStatus | null {
  if (error.code === "unauthorized" || error.status === 401) return "EXPIRED";
  if (authentication && (error.code === "forbidden" || error.status === 403)) return "INVALID";
  if (authentication && error.code === "validation") return "INVALID";
  if (authentication && error.code === "unknown") return "ERROR";
  return null;
}

function credentialFailureMessage(credential: WorkspaceCredential, status: CredentialStatus) {
  const label =
    credential === "api"
      ? "Apify API key"
      : credential === "ui"
        ? "Apify UI token"
        : "Apify cookies";
  if (status === "EXPIRED")
    return `${label} was rejected or has expired. Update it to restore access.`;
  if (status === "INVALID")
    return `${label} is not authorized for this operation. Update it to continue.`;
  return `${label} could not be used. Update it to restore access.`;
}

async function markWorkspaceCredentialIssue(
  tokenId: string,
  credential: WorkspaceCredential,
  status: CredentialStatus,
): Promise<void> {
  const statusField =
    credential === "api"
      ? "apiTokenStatus"
      : credential === "ui"
        ? "uiTokenStatus"
        : "cookiesStatus";
  const message = credentialFailureMessage(credential, status);
  try {
    await db.apifyToken.updateMany({
      where: { id: tokenId },
      data: { [statusField]: status, validatedAt: new Date(), validationError: message },
    });
  } catch (error) {
    log.error({ error, tokenId, credential }, "Could not persist Apify credential health");
  }
}

async function markWorkspaceCredentialValid(
  tokenId: string,
  credential: WorkspaceCredential,
): Promise<void> {
  const statusField =
    credential === "api"
      ? "apiTokenStatus"
      : credential === "ui"
        ? "uiTokenStatus"
        : "cookiesStatus";
  try {
    const current = await db.apifyToken.findUnique({ where: { id: tokenId } });
    if (!current) return;
    const currentStatus = current[statusField];
    if (currentStatus !== "VALID") {
      await db.apifyToken.updateMany({
        where: { id: tokenId },
        data: { [statusField]: "VALID", validatedAt: new Date() },
      });
    }
    const unhealthy = new Set(["EXPIRED", "INVALID", "ERROR"]);
    const hasOtherIssue = [
      current.encryptedToken ? (credential === "api" ? "VALID" : current.apiTokenStatus) : null,
      current.encryptedUiToken ? (credential === "ui" ? "VALID" : current.uiTokenStatus) : null,
      current.encryptedCookies
        ? credential === "cookies"
          ? "VALID"
          : current.cookiesStatus
        : null,
    ].some((status) => status !== null && unhealthy.has(status));
    if (!hasOtherIssue && current.validationError) {
      await db.apifyToken.updateMany({
        where: { id: tokenId },
        data: { validationError: null },
      });
    }
  } catch (error) {
    log.error({ error, tokenId, credential }, "Could not restore Apify credential health");
  }
}

function accountMismatchMessage(apiUsername: string | null) {
  const account = apiUsername ? ` for @${apiUsername}` : "";
  return `The saved Apify Console credential cannot access the Apify account or organization connected to this workspace${account}. Select that account in Apify Console, then replace only the Console credential.`;
}

/**
 * Resolve the safe, non-secret identity that Apify exposes for an API token.
 * This is intentionally limited to `/v2/users/me`; previewing a name must not
 * require Actor-list permissions or persist the token before the user confirms
 * the workspace label.
 */
export async function getApifyAccountIdentity(rawToken: string): Promise<ApifyAccountIdentity> {
  const token = rawToken.trim();
  if (!token) {
    throw new ApifyClientError("validation", "Provide an Apify API key", { status: 400 });
  }

  const probe = createApifyClient({ token, maxRetries: 1, requestTimeoutMs: 8_000 });
  const me = await probe.getMe();
  if (!me) {
    throw new ApifyClientError("unauthorized", "Apify rejected the API key", { status: 401 });
  }

  const displayName = me.name?.trim() || me.username;
  return {
    id: me.id,
    username: me.username,
    name: me.name,
    displayName,
    url: me.url,
  };
}

async function consoleIdentityCanAccess(
  client: ApifyClientWrapper,
  consoleUserId: string,
  apifyUserId: string,
): Promise<boolean> {
  if (consoleUserId === apifyUserId) return true;
  try {
    const organizations = await client.listConsoleOrganizations();
    return organizations.some((organization) => organization.id === apifyUserId);
  } catch {
    return false;
  }
}

async function markAdminCredentialIssue(
  key: "apify_api_token" | "apify_ui_token" | "apify_cookies",
  status: CredentialStatus,
): Promise<void> {
  const credential: WorkspaceCredential =
    key === "apify_api_token" ? "api" : key === "apify_ui_token" ? "ui" : "cookies";
  try {
    await recordIntegrationTest(key, "error", credentialFailureMessage(credential, status));
  } catch (error) {
    log.error({ error, key }, "Could not persist admin Apify credential health");
  }
}

async function persistWorkspaceConsoleCookies(
  tokenId: string,
  cookies: string,
  passphrase: string,
): Promise<void> {
  await db.apifyToken.updateMany({
    where: { id: tokenId },
    data: {
      encryptedCookies: encrypt(cookies, passphrase, "apify-cookies"),
      cookiesStatus: "VALID",
      validatedAt: new Date(),
      validationError: null,
    },
  });
}

async function persistAdminConsoleCookies(cookies: string): Promise<void> {
  await setIntegration("apify_cookies", cookies, {
    label: "Apify cookies",
    category: "apify",
    isSecret: true,
  });
  await recordIntegrationTest("apify_cookies", "ok", "Apify Console session is valid");
}

/**
 * Return the platform-level Apify client configured by an administrator.
 * This identity is used for shared catalog discovery and scheduled tracking,
 * so those jobs do not depend on whichever workspace credential was saved
 * most recently.
 */
export async function getAdminApifyClient(): Promise<ApifyClientWrapper | null> {
  const [token, uiToken, cookies, apiHealth, uiHealth, cookiesHealth] = await Promise.all([
    getIntegration("apify_api_token"),
    getIntegration("apify_ui_token"),
    getIntegration("apify_cookies"),
    getIntegrationHealth("apify_api_token"),
    getIntegrationHealth("apify_ui_token"),
    getIntegrationHealth("apify_cookies"),
  ]);
  if (!token && !uiToken && !cookies) return null;

  const activeConsoleCredential = selectActiveApifyConsoleCredential({
    uiConfigured: Boolean(uiToken),
    uiTestStatus: uiHealth?.testStatus,
    cookiesConfigured: Boolean(cookies),
    cookiesTestStatus: cookiesHealth?.testStatus,
  });
  const activeToken = token && apiHealth?.testStatus?.toLowerCase() !== "error" ? token : undefined;
  const activeUiToken =
    activeConsoleCredential === "apify_ui_token" ? (uiToken ?? undefined) : undefined;
  const activeCookies =
    activeConsoleCredential === "apify_cookies" ? (cookies ?? undefined) : undefined;
  if (!activeToken && !activeUiToken && !activeCookies) return null;

  const consoleKey = activeConsoleCredential;
  try {
    return createApifyClient({
      token: activeToken,
      uiToken: activeUiToken,
      cookies: activeCookies,
      onConsoleCookieRefresh: activeCookies ? persistAdminConsoleCookies : undefined,
      onCredentialError: async (credential, error, context) => {
        const status = statusForCredentialError(error, context.authentication);
        if (!status) return;
        const key = credential === "api" ? (activeToken ? "apify_api_token" : null) : consoleKey;
        if (key) await markAdminCredentialIssue(key, status);
      },
    });
  } catch (error) {
    const mapped = error instanceof ApifyClientError ? error : null;
    if (consoleKey && mapped) {
      const status = statusForCredentialError(mapped, true);
      if (status) await markAdminCredentialIssue(consoleKey, status);
    }
    if (activeToken) {
      return createApifyClient({
        token: activeToken,
        onCredentialError: async (_credential, credentialError, context) => {
          const status = statusForCredentialError(credentialError, context.authentication);
          if (status) await markAdminCredentialIssue("apify_api_token", status);
        },
      });
    }
    throw error;
  }
}

/**
 * Return a typed Apify client for the given user, or `null` if the user
 * has not connected an Apify account or the stored token cannot be
 * decrypted.
 */
export async function getUserApifyClient(
  userId: string,
  businessProfileId?: string,
): Promise<ApifyClientWrapper | null> {
  const row = businessProfileId
    ? await db.apifyToken.findUnique({ where: { businessProfileId } })
    : await db.apifyToken.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
  if (!row) return null;
  const passphrase = process.env.APP_ENCRYPTION_KEY;
  if (!passphrase) {
    log.error({ userId }, "APP_ENCRYPTION_KEY is not configured");
    await Promise.all([
      row.encryptedToken ? markWorkspaceCredentialIssue(row.id, "api", "ERROR") : Promise.resolve(),
      row.encryptedUiToken
        ? markWorkspaceCredentialIssue(row.id, "ui", "ERROR")
        : Promise.resolve(),
      row.encryptedCookies
        ? markWorkspaceCredentialIssue(row.id, "cookies", "ERROR")
        : Promise.resolve(),
    ]);
    return null;
  }
  let token: string | undefined;
  let uiToken: string | undefined;
  let cookies: string | undefined;
  const activeConsoleCredential = selectActiveApifyConsoleCredential({
    uiConfigured: Boolean(row.encryptedUiToken),
    uiTestStatus: row.uiTokenStatus,
    cookiesConfigured: Boolean(row.encryptedCookies),
    cookiesTestStatus: row.cookiesStatus,
  });
  if (row.encryptedToken) {
    try {
      token = decrypt(row.encryptedToken, passphrase, "apify");
    } catch (error) {
      log.error({ error, userId }, "Failed to decrypt Apify API key");
      await markWorkspaceCredentialIssue(row.id, "api", "ERROR");
    }
  }
  if (activeConsoleCredential === "apify_ui_token" && row.encryptedUiToken) {
    try {
      uiToken = decrypt(row.encryptedUiToken, passphrase, "apify-ui");
    } catch (error) {
      log.error({ error, userId }, "Failed to decrypt Apify UI token");
      await markWorkspaceCredentialIssue(row.id, "ui", "ERROR");
    }
  } else if (activeConsoleCredential === "apify_cookies" && row.encryptedCookies) {
    try {
      cookies = decrypt(row.encryptedCookies, passphrase, "apify-cookies");
    } catch (error) {
      log.error({ error, userId }, "Failed to decrypt Apify cookies");
      await markWorkspaceCredentialIssue(row.id, "cookies", "ERROR");
    }
  }
  if (!token && !uiToken && !cookies) return null;

  const consoleCredential: WorkspaceCredential | null = uiToken ? "ui" : cookies ? "cookies" : null;
  try {
    return createApifyClient({
      token,
      uiToken,
      cookies,
      consoleViewedUserId: row.apifyUserId ?? undefined,
      onConsoleCookieRefresh: cookies
        ? (refreshedCookies) => persistWorkspaceConsoleCookies(row.id, refreshedCookies, passphrase)
        : undefined,
      onCredentialError: async (credential, error, context) => {
        const status = statusForCredentialError(error, context.authentication);
        if (!status) return;
        const workspaceCredential =
          credential === "api" ? (token ? "api" : null) : consoleCredential;
        if (workspaceCredential) {
          await markWorkspaceCredentialIssue(row.id, workspaceCredential, status);
        }
      },
      onCredentialValid: async (credential) => {
        const workspaceCredential =
          credential === "api" ? (token ? "api" : null) : consoleCredential;
        if (workspaceCredential) {
          await markWorkspaceCredentialValid(row.id, workspaceCredential);
        }
      },
    });
  } catch (error) {
    const mapped = error instanceof ApifyClientError ? error : null;
    if (consoleCredential && mapped) {
      const status = statusForCredentialError(mapped, true);
      if (status) await markWorkspaceCredentialIssue(row.id, consoleCredential, status);
    }
    log.error({ error, userId }, "Failed to create Apify client");
    if (token) {
      return createApifyClient({
        token,
        onCredentialError: async (_credential, credentialError, context) => {
          const status = statusForCredentialError(credentialError, context.authentication);
          if (status) await markWorkspaceCredentialIssue(row.id, "api", status);
        },
      });
    }
    return null;
  }
}

/**
 * Cookies normally identify the human Console user while an API token can
 * identify either that user or an organization. Accept the credential when
 * the Console user can access the API token's organization. Direct UI tokens
 * do not expose their user ID, so their permissions continue to be validated
 * by the requested operation.
 */
export async function validateUserApifyAccountMatch(
  userId: string,
  businessProfileId?: string,
): Promise<ApifyAccountMatchResult> {
  const row = businessProfileId
    ? await db.apifyToken.findUnique({ where: { businessProfileId } })
    : await db.apifyToken.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
  if (!row?.encryptedCookies) {
    return {
      matches: null,
      apiUsername: row?.apifyUsername ?? null,
      consoleUserId: null,
      message: null,
    };
  }

  const client = await getUserApifyClient(userId, businessProfileId);
  if (!client) {
    return {
      matches: null,
      apiUsername: row.apifyUsername,
      consoleUserId: null,
      message: row.validationError,
    };
  }
  const session = await client.resumeConsoleAuthentication();
  if (!session.userId) {
    return {
      matches: null,
      apiUsername: row.apifyUsername,
      consoleUserId: null,
      message: null,
    };
  }
  await db.apifyToken.updateMany({
    where: { id: row.id },
    data: { consoleUserId: session.userId },
  });
  if (!row.apifyUserId) {
    return {
      matches: null,
      apiUsername: row.apifyUsername,
      consoleUserId: session.userId,
      message: null,
    };
  }
  if (!(await consoleIdentityCanAccess(client, session.userId, row.apifyUserId))) {
    const message = accountMismatchMessage(row.apifyUsername);
    await db.apifyToken.updateMany({
      where: { id: row.id },
      data: {
        cookiesStatus: "INVALID",
        validatedAt: new Date(),
        validationError: message,
      },
    });
    return {
      matches: false,
      apiUsername: row.apifyUsername,
      consoleUserId: session.userId,
      message,
    };
  }

  await markWorkspaceCredentialValid(row.id, "cookies");
  return {
    matches: true,
    apiUsername: row.apifyUsername,
    consoleUserId: session.userId,
    message: null,
  };
}

/**
 * Validate + encrypt + store a new Apify token for the user. One PAT per
 * user; re-connecting overwrites. Throws `ApifyClientError` with code
 * `unauthorized` if the token is rejected, so the UI can show a clear
 * "invalid token" error.
 */
export async function saveApifyToken(
  userId: string,
  rawToken?: string,
  businessProfileId?: string,
  rawUiToken?: string,
  rawCookies?: string,
  expectedConsoleUserId?: string,
  expectedApifyAccountId?: string,
  expectedApifyAccountType?: "PERSONAL" | "ORGANIZATION",
): Promise<{
  apifyUserId: string | null;
  apifyUsername: string | null;
  accountType: "PERSONAL" | "ORGANIZATION" | null;
  apiKeyConfigured: boolean;
  uiTokenConfigured: boolean;
  cookiesConfigured: boolean;
  apiTokenStatus: string;
  uiTokenStatus: string;
  cookiesStatus: string;
}> {
  const passphrase = process.env.APP_ENCRYPTION_KEY;
  if (!passphrase) {
    throw new ApifyClientError("unknown", "APP_ENCRYPTION_KEY is not set", { status: 500 });
  }

  const token = rawToken?.trim() || null;
  const hasUiTokenInput = Boolean(rawUiToken?.trim());
  const hasCookieInput = Boolean(rawCookies?.trim());
  if (hasUiTokenInput && hasCookieInput) {
    throw new ApifyClientError("validation", "Choose either an Apify UI key or cookies, not both", {
      status: 400,
    });
  }
  const uiToken = hasUiTokenInput ? normalizeConsoleUiToken(rawUiToken!) : null;
  let cookies = hasCookieInput ? normalizeConsoleCookies(rawCookies!) : null;
  if (!token && !uiToken && !cookies) {
    throw new ApifyClientError("validation", "Provide at least one Apify credential", {
      status: 400,
    });
  }

  let profileId = businessProfileId;
  if (!profileId) {
    const profile = await db.businessProfile.findFirst({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    if (!profile)
      throw new ApifyClientError("unknown", "Business profile is not configured", { status: 500 });
    profileId = profile.id;
  }

  const current = await db.apifyToken.findUnique({ where: { businessProfileId: profileId } });
  let apifyUserId = current?.apifyUserId ?? null;
  let consoleUserId = current?.consoleUserId ?? null;
  if (hasUiTokenInput) consoleUserId = null;
  let apifyUsername = current?.apifyUsername ?? null;
  let apiTokenStatus = current?.apiTokenStatus ?? "NOT_CONFIGURED";
  let uiTokenStatus = current?.uiTokenStatus ?? "NOT_CONFIGURED";
  let cookiesStatus = current?.cookiesStatus ?? "NOT_CONFIGURED";
  if (expectedApifyAccountId && current?.encryptedToken && current.apifyUserId !== expectedApifyAccountId) {
    throw new ApifyClientError(
      "validation",
      "This workspace's saved API key belongs to a different Apify account. Select its account or replace the API key in ActorConsole first.",
      { status: 409 },
    );
  }
  if (token) {
    const probe = createApifyClient({ token });
    try {
      const me = await probe.validateApiAuthentication();
      if (current?.encryptedCookies && current.apifyUserId && me.id !== current.apifyUserId) {
        throw new ApifyClientError(
          "validation",
          "This API key belongs to a different Apify account than the workspace's Console connection. Use a key for the connected account, or disconnect and reconnect the workspace first.",
          { status: 409 },
        );
      }
      apifyUserId = me.id;
      apifyUsername = me.username;
      apiTokenStatus = "VALID";
    } catch (err) {
      if (err instanceof ApifyClientError) throw err;
      throw new ApifyClientError("unauthorized", "Apify rejected the token", {
        status: 401,
        cause: err,
      });
    }
  }

  if (uiToken || cookies) {
    const publishingProbe = createApifyClient({
      ...(token ? { token } : {}),
      ...((expectedApifyAccountId ?? apifyUserId)
        ? { consoleViewedUserId: expectedApifyAccountId ?? apifyUserId! }
        : {}),
      ...(uiToken
        ? { uiToken }
        : {
            cookies: cookies!,
            onConsoleCookieRefresh: (refreshedCookies: string) => {
              cookies = refreshedCookies;
            },
          }),
    });
    try {
      await publishingProbe.validateConsoleAuthentication({ verifyOrganizations: true });
      if (cookies) {
        const session = await publishingProbe.resumeConsoleAuthentication();
        consoleUserId = session.userId;
        if (expectedConsoleUserId && session.userId !== expectedConsoleUserId) {
          throw new ApifyClientError(
            "validation",
            "The Apify session belongs to a different account than the one shown in the extension. Reload Apify Console and try again.",
            { status: 409 },
          );
        }
        if (expectedApifyAccountId) {
          const targetIsPersonal = expectedApifyAccountId === session.userId;
          if (
            (expectedApifyAccountType === "PERSONAL" && !targetIsPersonal) ||
            (expectedApifyAccountType === "ORGANIZATION" && targetIsPersonal)
          ) {
            throw new ApifyClientError("validation", "The selected Apify account type does not match the Console session", { status: 409 });
          }
          if (
            !targetIsPersonal &&
            !(await consoleIdentityCanAccess(publishingProbe, session.userId, expectedApifyAccountId))
          ) {
            throw new ApifyClientError("validation", "The signed-in Apify user cannot access the selected organization", { status: 409 });
          }
          if (!current?.encryptedToken && !token) {
            apifyUserId = expectedApifyAccountId;
            if (current?.apifyUserId !== expectedApifyAccountId) apifyUsername = null;
          }
        }
        if (
          apifyUserId &&
          session.userId &&
          !(await consoleIdentityCanAccess(publishingProbe, session.userId, apifyUserId))
        ) {
          throw new ApifyClientError("validation", accountMismatchMessage(apifyUsername), {
            status: 409,
          });
        }
      }
      if (uiToken) uiTokenStatus = "VALID";
      else cookiesStatus = "VALID";
    } catch (err) {
      if (err instanceof ApifyClientError && err.code === "validation") throw err;
      const reason = err instanceof ApifyClientError ? `: ${err.message}` : "";
      throw new ApifyClientError(
        "unauthorized",
        `Apify rejected the ${uiToken ? "UI token" : "cookies"}${reason}`,
        { status: 401, cause: err },
      );
    }
  }

  if (cookies && expectedApifyAccountId && apifyUserId === expectedApifyAccountId && !apifyUsername) {
    try {
      const response = await fetch(
        `https://api.apify.com/v2/users/${encodeURIComponent(expectedApifyAccountId)}`,
        { signal: AbortSignal.timeout(4_000) },
      );
      if (response.ok) {
        const body = (await response.json()) as { data?: { username?: unknown } };
        if (typeof body.data?.username === "string") apifyUsername = body.data.username;
      }
    } catch {
      // A private or unavailable public profile does not invalidate a verified Console session.
    }
  }

  const encryptedToken = token
    ? encrypt(token, passphrase, "apify")
    : (current?.encryptedToken ?? null);
  const encryptedUiToken = uiToken
    ? encrypt(uiToken, passphrase, "apify-ui")
    : cookies
      ? null
      : (current?.encryptedUiToken ?? null);
  const encryptedCookies = uiToken
    ? null
    : cookies
      ? encrypt(cookies, passphrase, "apify-cookies")
      : (current?.encryptedCookies ?? null);

  await db.apifyToken.upsert({
    where: { businessProfileId: profileId },
    create: {
      userId,
      businessProfileId: profileId,
      apifyUserId,
      consoleUserId,
      apifyUsername,
      encryptedToken,
      encryptedUiToken,
      encryptedCookies,
      scopes: [],
      apiTokenStatus: encryptedToken ? apiTokenStatus : "NOT_CONFIGURED",
      uiTokenStatus: encryptedUiToken ? uiTokenStatus : "NOT_CONFIGURED",
      cookiesStatus: encryptedCookies ? cookiesStatus : "NOT_CONFIGURED",
      validatedAt: new Date(),
      validationError: null,
    },
    update: {
      apifyUserId,
      consoleUserId,
      apifyUsername,
      encryptedToken,
      encryptedUiToken,
      encryptedCookies,
      apiTokenStatus: encryptedToken ? apiTokenStatus : "NOT_CONFIGURED",
      uiTokenStatus: encryptedUiToken ? uiTokenStatus : "NOT_CONFIGURED",
      cookiesStatus: encryptedCookies ? cookiesStatus : "NOT_CONFIGURED",
      validatedAt: new Date(),
      validationError: null,
      updatedAt: new Date(),
    },
  });

  return {
    apifyUserId,
    apifyUsername,
    accountType: consoleUserId && apifyUserId
      ? consoleUserId === apifyUserId ? "PERSONAL" : "ORGANIZATION"
      : null,
    apiKeyConfigured: Boolean(encryptedToken),
    uiTokenConfigured: Boolean(encryptedUiToken),
    cookiesConfigured: Boolean(encryptedCookies),
    apiTokenStatus: encryptedToken ? apiTokenStatus : "NOT_CONFIGURED",
    uiTokenStatus: encryptedUiToken ? uiTokenStatus : "NOT_CONFIGURED",
    cookiesStatus: encryptedCookies ? cookiesStatus : "NOT_CONFIGURED",
  };
}

export async function revokeApifyToken(userId: string, businessProfileId?: string): Promise<void> {
  await db.apifyToken.deleteMany({
    where: businessProfileId ? { userId, businessProfileId } : { userId },
  });
}
