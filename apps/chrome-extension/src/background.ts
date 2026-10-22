import {
  ACTORCONSOLE_CONNECT_URL,
  ACTORCONSOLE_DEVICE_API,
  ACTORCONSOLE_ORIGIN,
  APIFY_SESSION_CLEARED,
  APIFY_SESSION_DETECTED,
  DELIVER_COOKIE,
  CREATE_WORKSPACE,
  DISCONNECT_WORKSPACE,
  CHECK_WORKSPACE_CONNECTION,
  SELECT_APIFY_ACCOUNT,
  GET_STATE,
  REFRESH_CONNECTIONS,
  HANDOFF_RESULT,
  OPEN_ACTORCONSOLE,
  OPEN_WORKSPACE_SETTINGS,
  IMPORT_APIFY_API_KEY,
  PAIR_BEGIN,
  PAIR_CHANGED,
  PAIR_COMPLETE,
  REGISTER_HANDOFF,
  UNPAIR,
  type ActorConsoleAccount,
  type ActorConsoleWorkspace,
  type ExtensionHandoff,
  type HandoffResult,
  type DetectedApifyAccount,
  type CachedApifyAccount,
  type DisplayApifyAccount,
  type ApifyOrganization,
  apifyConsoleUrl,
  isExtensionHandoff,
} from "./messages";
import { parseApifyResumeSession } from "./apify-resume";
import { APIFY_ACCOUNT_CACHE_KEY, cacheApifyAccount, parseCachedApifyAccount } from "./account-cache";
import { navigateActiveTab } from "./tab-navigation";
import { browserPairUrl, createBrowserPairRequest, pollBrowserPair, type BrowserPairRequest } from "./device-pairing";
import { PairingExpiredError, verifyDeviceAccount } from "./device-session";

type PendingHandoff = ExtensionHandoff & { tabId: number };
type PairedDevice = { token: string; account: ActorConsoleAccount };
type PendingPair = { challenge: string; tabId: number } & Partial<BrowserPairRequest>;
type WorkspaceListResponse = { ok?: boolean; data?: ActorConsoleWorkspace[]; error?: { message?: string } };
const ACCOUNT_MAX_AGE_MS = 30 * 60 * 1_000;

let pendingHandoff: PendingHandoff | null = null;
let lastResult: HandoffResult | null = null;
let detectedAccount: DetectedApifyAccount | null = null;
let pendingPair: PendingPair | null = null;
let pairedDevice: PairedDevice | null = null;
let deviceVerificationError: string | null = null;
let pollingPair = false;
let pairPollTimer: ReturnType<typeof setTimeout> | undefined;
const trustedStorageReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

async function storedDevice(): Promise<PairedDevice | null> {
  await trustedStorageReady;
  if (!pairedDevice) {
    const stored = await chrome.storage.local.get("pairedDevice");
    pairedDevice = (stored.pairedDevice as PairedDevice | undefined) ?? null;
  }
  return pairedDevice;
}

async function savePairedDevice(data: ActorConsoleAccount & { token: string }) {
  await trustedStorageReady;
  const previousDevice = await storedDevice();
  if (previousDevice && previousDevice.account.userId !== data.userId) {
    await chrome.storage.local.remove(APIFY_ACCOUNT_CACHE_KEY);
  }
  const { token, ...account } = data;
  pairedDevice = { token, account };
  deviceVerificationError = null;
  await chrome.storage.local.set({ pairedDevice });
  pendingPair = null;
  pendingHandoff = null;
  lastResult = null;
  clearTimeout(pairPollTimer);
  await Promise.all([
    chrome.storage.session.remove("pendingPair"),
    chrome.storage.session.remove("pendingHandoff"),
    chrome.storage.session.remove("lastResult"),
  ]);
  await notifyAccountChanged(PAIR_CHANGED);
  return account;
}

async function checkBrowserPair() {
  if (pollingPair) return;
  pollingPair = true;
  try {
    const pair = await currentPair();
    if (!pair?.verifier || !pair.expiresAt) return;
    if (pair.expiresAt <= Date.now()) {
      pendingPair = null;
      await chrome.storage.session.remove("pendingPair");
      return;
    }
    const data = await pollBrowserPair(pair as BrowserPairRequest);
    // Ignore a result for a request that was cancelled or replaced while fetching.
    if ((await currentPair())?.challenge === pair.challenge && data) {
      await savePairedDevice(data);
    }
  } catch {
    // Transient network failures can be retried until the request expires.
  } finally {
    pollingPair = false;
    clearTimeout(pairPollTimer);
    if (pendingPair?.verifier) pairPollTimer = setTimeout(() => void checkBrowserPair(), 3_000);
  }
}

async function clearDevice(): Promise<void> {
  await trustedStorageReady;
  pairedDevice = null;
  deviceVerificationError = null;
  pendingHandoff = null;
  lastResult = null;
  pendingPair = null;
  clearTimeout(pairPollTimer);
  await Promise.all([
    chrome.storage.local.remove(["pairedDevice", APIFY_ACCOUNT_CACHE_KEY]),
    chrome.storage.session.remove("pendingHandoff"),
    chrome.storage.session.remove("lastResult"),
    chrome.storage.session.remove("pendingPair"),
  ]);
  await notifyAccountChanged(PAIR_CHANGED);
}

async function verifiedDevice(): Promise<PairedDevice | null> {
  const device = await storedDevice();
  if (!device) return null;
  try {
    const account = await verifyDeviceAccount(device.token, device.account.userId);
    pairedDevice = { token: device.token, account };
    deviceVerificationError = null;
    await chrome.storage.local.set({ pairedDevice });
    return pairedDevice;
  } catch (error) {
    if (error instanceof PairingExpiredError) await clearDevice();
    deviceVerificationError = error instanceof Error ? error.message : "Could not verify the ActorConsole connection.";
    return null;
  }
}

async function deviceWorkspaces(device: PairedDevice, apifyUserId?: string): Promise<ActorConsoleWorkspace[]> {
  const response = await fetch(
    `${ACTORCONSOLE_DEVICE_API}/workspaces${apifyUserId ? `?apifyUserId=${encodeURIComponent(apifyUserId)}` : ""}`,
    {
      headers: { authorization: `Bearer ${device.token}` },
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    },
  );
  const body = (await response.json().catch(() => null)) as WorkspaceListResponse | null;
  if (!response.ok || !body?.ok || !Array.isArray(body.data)) {
    throw new Error(body?.error?.message ?? "Could not load ActorConsole workspaces.");
  }
  return body.data;
}

// Runs only after a sidebar action, inside an already open Apify Console tab.
// This follows Console's account-specific authentication and access-key calls.
// The UI token never leaves the page function; only the API key is returned to
// the service worker for immediate delivery to ActorConsole.
async function readApiKeyInConsole(
  accountId: string,
  personalUserId: string,
  accountType: "PERSONAL" | "ORGANIZATION",
  workspaceId: string,
  workspaceName: string,
): Promise<{ token?: string; error?: string }> {
  try {
    const resume = await fetch("https://console-backend.apify.com/public/authentication/resume", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-idempotency-key": crypto.randomUUID(),
      },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({
        viewedUserId: accountType === "ORGANIZATION" ? accountId : "",
        forceAdminToken: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resume.ok) {
      return { error: "Apify Console could not resume this account. Sign in or switch to this organization, then try again." };
    }
    const resumeBody = await resume.json() as unknown;
    const resumeRecord = resumeBody && typeof resumeBody === "object"
      ? resumeBody as Record<string, unknown> : null;
    const session = resumeRecord?.data && typeof resumeRecord.data === "object"
      ? resumeRecord.data as Record<string, unknown> : resumeRecord;
    if (typeof session?.userId !== "string") {
      return { error: "Apify Console returned an incomplete session. Reload Console and try again." };
    }
    if (session?.userId !== personalUserId) {
      return { error: "Apify Console is signed in to a different personal account. Open the correct Apify account and try again." };
    }
    if (typeof session.uiToken !== "string" ||
      !/^apify_ui_[A-Za-z0-9_-]{12,8192}$/.test(session.uiToken)) {
      return { error: "Apify Console did not return a usable session. Reload Console and try again." };
    }
    const description = `ActorConsole workspace ${workspaceName.slice(0, Math.max(0, 134 - workspaceId.length))} [${workspaceId}]`;
    const accessKeys = await fetch(
      "https://console-backend.apify.com/iam-access-keys",
      {
        headers: {
          authorization: `Bearer ${session.uiToken}`,
          accept: "application/json",
          "x-idempotency-key": crypto.randomUUID(),
        },
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!accessKeys.ok) {
      return { error: "Apify did not allow access to this account's API keys. Check your organization permissions in API & Integrations." };
    }
    const keyBody = await accessKeys.json() as unknown;
    const keyRecord = keyBody && typeof keyBody === "object"
      ? keyBody as Record<string, unknown> : null;
    const keyPayload = keyRecord?.data ?? keyBody;
    const keys = Array.isArray(keyPayload) ? keyPayload
      : keyPayload && typeof keyPayload === "object" &&
        Array.isArray((keyPayload as Record<string, unknown>).items)
        ? (keyPayload as { items: unknown[] }).items : null;
    if (!keys) {
      return { error: "Apify returned an unexpected API key list. Review API & Integrations before trying again." };
    }
    const matching = keys.find((value: unknown) => {
      if (!value || typeof value !== "object") return false;
      const entry = value as {
        type?: unknown;
        token?: unknown;
        description?: unknown;
        expiresAt?: unknown;
        hasLeaked?: unknown;
        permissionScope?: unknown;
      };
      return entry.type === "API_TOKEN" && typeof entry.token === "string" &&
        entry.token.length >= 20 && entry.token.length <= 2048 && !/[\s;,]/.test(entry.token) &&
        typeof entry.description === "string" &&
        entry.description.startsWith("ActorConsole workspace ") &&
        entry.description.endsWith(`[${workspaceId}]`) &&
        !entry.hasLeaked && !entry.permissionScope &&
        (!entry.expiresAt || Date.parse(String(entry.expiresAt)) > Date.now());
    }) as { token: string } | undefined;
    if (matching) return { token: matching.token };

    const created = await fetch("https://console-backend.apify.com/api-keys", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.uiToken}`,
        "content-type": "application/json",
        accept: "application/json",
        "x-idempotency-key": crypto.randomUUID(),
      },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({
        userId: personalUserId,
        impersonatingUserId: accountId,
        description,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!created.ok) {
      return { error: "Apify did not allow creating an API key for this account. Check your membership permissions in API & Integrations." };
    }
    const createdBody = await created.json() as unknown;
    const createdRecord = createdBody && typeof createdBody === "object"
      ? createdBody as Record<string, unknown> : null;
    const createdKey = createdRecord?.data && typeof createdRecord.data === "object"
      ? createdRecord.data as Record<string, unknown> : createdRecord;
    const token = createdKey?.token;
    return typeof token === "string" && token.length >= 20 && token.length <= 2048 && !/[\s;,]/.test(token)
      ? { token }
      : { error: "Apify did not return the new API key. Review API & Integrations before trying again." };
  } catch {
    return { error: "Could not read this account's API key from Apify Console. Reload Console and try again." };
  }
}

async function currentPair(): Promise<PendingPair | null> {
  if (!pendingPair) {
    const stored = await chrome.storage.session.get("pendingPair");
    pendingPair = (stored.pendingPair as PendingPair | undefined) ?? null;
  }
  return pendingPair;
}

function isActorConsoleTab(
  sender: chrome.runtime.MessageSender,
): sender is chrome.runtime.MessageSender & {
  tab: chrome.tabs.Tab & { id: number; url: string };
} {
  if (typeof sender.tab?.id !== "number" || typeof sender.tab.url !== "string") return false;
  try {
    return new URL(sender.tab.url).origin === ACTORCONSOLE_ORIGIN;
  } catch {
    return false;
  }
}

function isApifyConsoleTab(sender: chrome.runtime.MessageSender): boolean {
  const url = sender.tab?.url;
  if (typeof url !== "string") return false;
  try {
    const origin = new URL(url).origin;
    return origin === "https://console.apify.com" || origin === "https://console-backend.apify.com";
  } catch {
    return false;
  }
}

async function currentAccount(): Promise<DetectedApifyAccount | null> {
  if (!detectedAccount) {
    const stored = await chrome.storage.session.get("detectedAccount");
    detectedAccount = (stored.detectedAccount as DetectedApifyAccount | undefined) ?? null;
  }
  if (!detectedAccount) return null;
  detectedAccount.organizations ??= [];
  detectedAccount.selectedAccountId ??= detectedAccount.userId;
  detectedAccount.organizationsStatus ??= "unavailable";
  detectedAccount.sourceOrigin ??= "console";
  detectedAccount.viewedUserId ??= null;
  detectedAccount.selectionManual ??= false;
  const observedAt = Date.parse(detectedAccount.observedAt);
  if (!Number.isFinite(observedAt) || Date.now() - observedAt > ACCOUNT_MAX_AGE_MS) {
    detectedAccount = null;
    await chrome.storage.session.remove("detectedAccount");
  }
  return detectedAccount;
}

async function cachedAccount(): Promise<CachedApifyAccount | null> {
  await trustedStorageReady;
  const stored = await chrome.storage.local.get(APIFY_ACCOUNT_CACHE_KEY);
  return parseCachedApifyAccount(stored[APIFY_ACCOUNT_CACHE_KEY]);
}

async function saveAccountCache(account: DetectedApifyAccount): Promise<void> {
  const cache = cacheApifyAccount(account, await cachedAccount());
  await chrome.storage.local.set({ [APIFY_ACCOUNT_CACHE_KEY]: cache });
}

async function notifyAccountChanged(type: string): Promise<void> {
  await chrome.runtime.sendMessage({ type }).catch(() => undefined);
}

type ApifyProfile = {
  id?: unknown;
  username?: unknown;
  profile?: { name?: unknown; pictureUrl?: unknown };
};

function selectedApifyAccount(account: DisplayApifyAccount) {
  const organization = account.organizations.find((item) => item.id === account.selectedAccountId);
  return organization
    ? { id: organization.id, type: "ORGANIZATION" as const }
    : { id: account.userId, type: "PERSONAL" as const };
}

function availableApifyAccount(account: DetectedApifyAccount, accountId: string) {
  if (accountId === account.userId) return { id: accountId, type: "PERSONAL" as const };
  return account.organizations.some((organization) => organization.id === accountId)
    ? { id: accountId, type: "ORGANIZATION" as const }
    : null;
}

async function fetchOrganizations(uiToken: string): Promise<ApifyOrganization[]> {
  const response = await fetch("https://console-backend.apify.com/organizations", {
    headers: {
      authorization: `Bearer ${uiToken}`,
      accept: "application/json, text/plain, */*",
      "x-idempotency-key": crypto.randomUUID(),
    },
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`Organization lookup returned HTTP ${response.status}`);
  const body = (await response.json()) as unknown;
  const value = body && typeof body === "object" && "data" in body
    ? (body as { data: unknown }).data
    : body;
  if (!Array.isArray(value)) throw new Error("Organization lookup returned an invalid response");
  const seen = new Set<string>();
  return value.flatMap((item): ApifyOrganization[] => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const id = entry._id ?? entry.id;
    if (typeof id !== "string" || !/^[A-Za-z0-9]{8,64}$/.test(id) || seen.has(id)) return [];
    seen.add(id);
    const name = entry.name ?? entry.title ?? entry.username;
    const profile = entry.profile && typeof entry.profile === "object"
      ? entry.profile as Record<string, unknown>
      : null;
    const pictureUrl = profile?.pictureUrl ?? entry.pictureUrl;
    return [{
      id,
      name: typeof name === "string" && name.trim() ? name : `Organization ${id}`,
      username: typeof entry.username === "string" ? entry.username : null,
      pictureUrl: typeof pictureUrl === "string" ? pictureUrl : null,
    }];
  });
}

async function fetchAccountProfile(userId: string, uiToken: string): Promise<ApifyProfile | null> {
  // A public profile can be unavailable. Try the account's own authenticated
  // profile without asking the user for an API key.
  try {
    const response = await fetch("https://api.apify.com/v2/users/me", {
      headers: { authorization: `Bearer ${uiToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      const body = (await response.json()) as { data?: ApifyProfile };
      if (body.data?.id === userId) return body.data;
    }
  } catch {
    // Public profile lookup below can still resolve published accounts.
  }

  try {
    const response = await fetch(`https://api.apify.com/v2/users/${encodeURIComponent(userId)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: ApifyProfile };
    return body.data ?? null;
  } catch {
    return null;
  }
}

async function resolveAccountDetails(
  userId: string,
  observedAt: string,
  uiToken: string,
): Promise<void> {
  const [profileResult, organizationsResult] = await Promise.allSettled([
    fetchAccountProfile(userId, uiToken),
    fetchOrganizations(uiToken),
  ]);
  let current = await currentAccount();
  if (!current || current.userId !== userId || current.observedAt !== observedAt) return;
  const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
  let organizations = organizationsResult.status === "fulfilled" ? organizationsResult.value : [];
  let organizationsStatus: DetectedApifyAccount["organizationsStatus"] =
    organizationsResult.status === "fulfilled" ? "ready" : "unavailable";
  if (
    organizationsResult.status === "rejected" &&
    current.viewedUserId && current.viewedUserId !== userId
  ) {
    const viewedProfile = await fetchAccountProfile(current.viewedUserId, uiToken);
    organizations = [{
      id: current.viewedUserId,
      name: typeof viewedProfile?.profile?.name === "string"
        ? viewedProfile.profile.name
        : typeof viewedProfile?.username === "string"
          ? viewedProfile.username
          : `Organization ${current.viewedUserId}`,
      username: typeof viewedProfile?.username === "string" ? viewedProfile.username : null,
      pictureUrl: typeof viewedProfile?.profile?.pictureUrl === "string"
        ? viewedProfile.profile.pictureUrl
        : null,
    }];
    organizationsStatus = "limited";
  }
  current = await currentAccount();
  if (!current || current.userId !== userId || current.observedAt !== observedAt) return;
  const selectedAccountId = current.selectionManual &&
    (current.selectedAccountId === userId || organizations.some((item) => item.id === current.selectedAccountId))
    ? current.selectedAccountId
    : current.viewedUserId && organizations.some((item) => item.id === current.viewedUserId)
      ? current.viewedUserId
      : organizations.some((item) => item.id === current.selectedAccountId)
        ? current.selectedAccountId
      : userId;
  detectedAccount = {
    ...current,
    username: typeof profile?.username === "string" ? profile.username : current.username,
    displayName: typeof profile?.profile?.name === "string" ? profile.profile.name : current.displayName,
    pictureUrl:
      typeof profile?.profile?.pictureUrl === "string" ? profile.profile.pictureUrl : current.pictureUrl,
    organizations,
    organizationsStatus,
    selectedAccountId,
  };
  await chrome.storage.session.set({ detectedAccount });
  await saveAccountCache(detectedAccount).catch(() => undefined);
  await notifyAccountChanged(APIFY_SESSION_DETECTED);
}

async function currentPending(): Promise<PendingHandoff | null> {
  if (!pendingHandoff) {
    const stored = await chrome.storage.session.get("pendingHandoff");
    pendingHandoff = (stored.pendingHandoff as PendingHandoff | undefined) ?? null;
  }
  if (!pendingHandoff) return null;
  if (new Date(pendingHandoff.expiresAt).getTime() <= Date.now()) {
    pendingHandoff = null;
    await chrome.storage.session.remove("pendingHandoff");
    return null;
  }
  return pendingHandoff;
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  void handleMessage(message, sender).then(sendResponse, () =>
    sendResponse({ ok: false, error: "The extension could not complete this request." }),
  );
  return true;
});

async function handleMessage(message: unknown, sender: chrome.runtime.MessageSender) {
  if (!message || typeof message !== "object") return { ok: false, error: "Invalid message" };
  const input = message as {
    type?: string;
    payload?: unknown;
    apifyRt?: string;
    expectedApifyUserId?: string;
    workspaceId?: string;
    workspaceName?: string;
    connectAfterCreate?: boolean;
    apifyAccountId?: string;
  };

  if (input.type === PAIR_BEGIN) {
    if (sender.tab) return { ok: false, error: "Open pairing from the extension sidebar." };
    const request = await createBrowserPairRequest();
    const tab = await chrome.tabs.create({
      url: browserPairUrl(request),
    });
    if (typeof tab.id !== "number") return { ok: false, error: "Could not open the pairing page." };
    pendingPair = { ...request, tabId: tab.id };
    await chrome.storage.session.set({ pendingPair });
    void checkBrowserPair();
    return { ok: true };
  }

  if (input.type === PAIR_COMPLETE) {
    const pair = await currentPair();
    const payload = input.payload as { challenge?: unknown; code?: unknown } | null;
    if (
      !isActorConsoleTab(sender) ||
      !pair ||
      pair.tabId !== sender.tab.id ||
      payload?.challenge !== pair.challenge ||
      typeof payload.code !== "string" ||
      !/^acp_[a-f0-9]{64}$/.test(payload.code)
    ) {
      return { ok: false, error: "This pairing does not match the extension." };
    }
    const response = await fetch(`${ACTORCONSOLE_DEVICE_API}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ challenge: pair.challenge, code: payload.code }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      data?: ActorConsoleAccount & { token: string };
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.ok || !body.data || !/^acx_[a-f0-9]{64}$/.test(body.data.token)) {
      return { ok: false, error: body?.error?.message ?? "ActorConsole pairing failed." };
    }
    const account = await savePairedDevice(body.data);
    return { ok: true, account };
  }

  if (input.type === UNPAIR) {
    if (sender.tab) return { ok: false, error: "Disconnect from the extension sidebar." };
    const device = await storedDevice();
    if (device) {
      const response = await fetch(`${ACTORCONSOLE_DEVICE_API}/me`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${device.token}` },
        credentials: "omit",
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok && response.status !== 401) {
        return { ok: false, error: "Could not revoke the ActorConsole pairing. Try again." };
      }
    }
    await clearDevice();
    return { ok: true };
  }

  if (input.type === REGISTER_HANDOFF) {
    if (!isActorConsoleTab(sender) || !isExtensionHandoff(input.payload)) {
      return { ok: false, error: "Untrusted handoff source" };
    }
    const expiresAt = new Date(input.payload.expiresAt).getTime();
    if (expiresAt <= Date.now() || expiresAt > Date.now() + 10 * 60 * 1_000) {
      return { ok: false, error: "Invalid handoff expiry" };
    }
    const device = await verifiedDevice();
    if (!device) return { ok: false, error: deviceVerificationError ?? "Pair the extension with ActorConsole first." };
    const detected = await currentAccount();
    if (!detected) return { ok: false, error: "Reload Apify Console to detect your account." };
    const selected = selectedApifyAccount(detected);
    const requested = input.payload.account;
    if (requested && (requested.id !== selected.id || requested.type !== selected.type)) {
      return { ok: false, error: "The selected Apify account changed. Start the connection again." };
    }
    const authorized = await fetch(`${ACTORCONSOLE_DEVICE_API}/authorize-handoff`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${device.token}`,
      },
      credentials: "omit",
      body: JSON.stringify({
        handoffId: input.payload.handoffId,
        challenge: input.payload.challenge,
        apifyAccountId: selected.id,
        apifyAccountType: selected.type,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!authorized.ok) {
      return { ok: false, error: "This workspace handoff is not for the paired ActorConsole account." };
    }
    pendingHandoff = { ...input.payload, account: selected, tabId: sender.tab.id };
    lastResult = null;
    await chrome.storage.session.set({ pendingHandoff });
    await chrome.storage.session.remove("lastResult");
    void chrome.runtime.sendMessage({ type: REGISTER_HANDOFF }).catch(() => undefined);
    return { ok: true };
  }

  if (input.type === GET_STATE) {
    // Resume a pending login when Chrome has restarted the service worker.
    void checkBrowserPair();
    const device = await verifiedDevice();
    const pending = await currentPending();
    const account = await currentAccount();
    let savedAccount = device && !sender.tab ? await cachedAccount() : null;
    if (device && !sender.tab && account && !savedAccount) {
      await saveAccountCache(account).catch(() => undefined);
      savedAccount = await cachedAccount();
    }
    let workspaces: ActorConsoleWorkspace[] = [];
    let workspaceError: string | null = null;
    if (device && !sender.tab) {
      try {
        workspaces = await deviceWorkspaces(
          device,
          account && account.organizationsStatus !== "loading"
            ? selectedApifyAccount(account).id : undefined,
        );
      } catch (error) {
        workspaceError = error instanceof Error ? error.message : "Could not load workspaces.";
      }
    }
    if (!lastResult) {
      const stored = await chrome.storage.session.get("lastResult");
      lastResult = (stored.lastResult as HandoffResult | undefined) ?? null;
    }
    return {
      ok: true,
      pending: pending
        ? {
            handoffId: pending.handoffId,
            expiresAt: pending.expiresAt,
            workspace: pending.workspace,
            account: pending.account,
          }
        : null,
      result: lastResult,
      account,
      cachedAccount: savedAccount,
      workspaces,
      workspaceError,
      actorConsoleAccount: device?.account ?? null,
      actorConsoleError: deviceVerificationError,
      storedActorConsoleAccount: !sender.tab ? (await storedDevice())?.account ?? null : null,
      pairingStored: Boolean(await storedDevice()),
    };
  }

  if (input.type === REFRESH_CONNECTIONS) {
    if (sender.tab) return { ok: false, error: "Refresh from the extension sidebar." };
    const device = await verifiedDevice();
    if (!device) return { ok: false, error: deviceVerificationError ?? "Pair the extension with ActorConsole first." };
    const current = await currentAccount();
    const saved = await cachedAccount();
    const consoleAccount = current && (current.organizationsStatus === "ready" ||
      current.organizations.some((item) => item.id === current.selectedAccountId))
      ? current : saved?.userId === current?.userId ? saved : current ?? saved;
    const consoleUrl = apifyConsoleUrl(consoleAccount ? selectedApifyAccount(consoleAccount) : null);
    detectedAccount = null;
    lastResult = null;
    await Promise.all([
      chrome.storage.session.remove("detectedAccount"),
      chrome.storage.session.remove("lastResult"),
    ]);
    await notifyAccountChanged(APIFY_SESSION_CLEARED);
    const consoleTabs = await chrome.tabs.query({ url: "https://console.apify.com/*" });
    const tab = consoleTabs.find((item) => item.active && typeof item.id === "number") ??
      consoleTabs.find((item) => typeof item.id === "number");
    if (typeof tab?.id === "number") {
      await chrome.tabs.update(tab.id, { url: consoleUrl });
      return { ok: true, action: "reloaded" };
    }
    await chrome.tabs.create({ url: consoleUrl });
    return { ok: true, action: "opened" };
  }

  if (input.type === APIFY_SESSION_DETECTED) {
    if (!isApifyConsoleTab(sender)) return { ok: false, error: "Untrusted Apify session source" };
    const session = parseApifyResumeSession(input.payload);
    if (!session) return { ok: false, error: "Invalid Apify resume response" };
    const userId = session.userId;
    const payload = input.payload as { viewedUserId?: unknown };
    const viewedUserId = typeof payload.viewedUserId === "string" &&
      /^[A-Za-z0-9]{8,64}$/.test(payload.viewedUserId)
      ? payload.viewedUserId
      : null;
    const observedAt = new Date().toISOString();
    const previous = await currentAccount();
    const sameAccount = previous?.userId === userId;
    const saved = await cachedAccount();
    detectedAccount = {
      userId,
      username: sameAccount ? previous.username : null,
      displayName: sameAccount ? previous.displayName : null,
      pictureUrl: sameAccount ? (previous.pictureUrl ?? null) : null,
      observedAt,
      sourceOrigin: new URL(sender.tab?.url ?? "https://console-backend.apify.com").origin === "https://console.apify.com" ? "console" : "backend",
      viewedUserId,
      selectedAccountId: sameAccount && previous.selectionManual
        ? previous.selectedAccountId : saved?.userId === userId ? saved.selectedAccountId : userId,
      selectionManual: sameAccount ? previous.selectionManual : false,
      organizations: sameAccount ? previous.organizations : [],
      organizationsStatus: "loading",
    };
    await chrome.storage.session.set({ detectedAccount });
    await saveAccountCache(detectedAccount).catch(() => undefined);
    await notifyAccountChanged(APIFY_SESSION_DETECTED);
    void resolveAccountDetails(userId, observedAt, session.uiToken);
    session.uiToken = "";
    return { ok: true };
  }

  if (input.type === APIFY_SESSION_CLEARED) {
    if (!isApifyConsoleTab(sender)) return { ok: false, error: "Untrusted Apify session source" };
    detectedAccount = null;
    await chrome.storage.session.remove("detectedAccount");
    await notifyAccountChanged(APIFY_SESSION_CLEARED);
    return { ok: true };
  }

  if (input.type === SELECT_APIFY_ACCOUNT) {
    if (sender.tab) return { ok: false, error: "Select an account from the extension sidebar." };
    const account = await currentAccount();
    if (!account) return { ok: false, error: "Reload Apify Console to detect your account." };
    if (typeof input.apifyAccountId !== "string" || (
      input.apifyAccountId !== account.userId &&
      !account.organizations.some((item) => item.id === input.apifyAccountId)
    )) return { ok: false, error: "This Apify account is not available in the current session." };
    detectedAccount = { ...account, selectedAccountId: input.apifyAccountId, selectionManual: true };
    await chrome.storage.session.set({ detectedAccount });
    await saveAccountCache(detectedAccount).catch(() => undefined);
    await notifyAccountChanged(APIFY_SESSION_DETECTED);
    return { ok: true };
  }

  if (input.type === OPEN_ACTORCONSOLE) {
    if (sender.tab) return { ok: false, error: "Open a workspace from the extension sidebar." };
    const device = await verifiedDevice();
    if (!device) {
      return { ok: false, error: deviceVerificationError ?? "Pair the extension with an ActorConsole account first." };
    }
    const account = await currentAccount();
    if (!account) {
      return { ok: false, error: "Open or reload Apify Console to detect the signed-in account." };
    }
    if (account.organizationsStatus === "loading") {
      return { ok: false, error: "Wait for the Apify account list to load." };
    }
    if (typeof input.workspaceId !== "string") {
      return { ok: false, error: "Choose an ActorConsole workspace first." };
    }
    const selected = availableApifyAccount(
      account,
      input.apifyAccountId ?? selectedApifyAccount(account).id,
    );
    if (!selected) {
      return { ok: false, error: "This workspace's Apify account is not in the loaded account list. Refresh the list or switch accounts in Apify Console." };
    }
    const workspaces = await deviceWorkspaces(device, selected.id);
    const workspace = workspaces.find((item) => item.id === input.workspaceId);
    if (!workspace) {
      return { ok: false, error: "This workspace cannot be connected to the current Apify account." };
    }
    if (workspace.connectedAccountId && workspace.connectedAccountId !== selected.id) {
      return { ok: false, error: "This workspace is linked to a different Apify account. Reconnect its saved account instead." };
    }
    if (workspace.apiKeyConfigured && workspace.connectedAccountId !== selected.id) {
      return { ok: false, error: "This workspace's API key needs to be updated in ActorConsole first." };
    }
    if (account.selectedAccountId !== selected.id) {
      detectedAccount = { ...account, selectedAccountId: selected.id, selectionManual: true };
      await chrome.storage.session.set({ detectedAccount });
      await notifyAccountChanged(APIFY_SESSION_DETECTED);
    }
    const opened = await navigateActiveTab(`${ACTORCONSOLE_CONNECT_URL}&workspace=${encodeURIComponent(workspace.id)}&apifyAccountId=${encodeURIComponent(selected.id)}&apifyAccountType=${selected.type}`);
    if (!opened) return { ok: false, error: "Select a browser tab before opening ActorConsole." };
    return { ok: true };
  }

  if (input.type === OPEN_WORKSPACE_SETTINGS) {
    if (sender.tab) return { ok: false, error: "Open workspace settings from the extension sidebar." };
    const device = await verifiedDevice();
    if (!device) return { ok: false, error: deviceVerificationError ?? "Pair the extension with ActorConsole first." };
    if (typeof input.workspaceId !== "string") {
      return { ok: false, error: "Choose a workspace to update." };
    }
    const workspaces = await deviceWorkspaces(device);
    if (!workspaces.some((workspace) => workspace.id === input.workspaceId)) {
      return { ok: false, error: "This workspace is not available to the paired account." };
    }
    const opened = await navigateActiveTab(
      `${ACTORCONSOLE_ORIGIN}/dashboard/apify?extension=settings&workspace=${encodeURIComponent(input.workspaceId)}`,
    );
    if (!opened) return { ok: false, error: "Select a browser tab before opening workspace settings." };
    return { ok: true };
  }

  if (input.type === IMPORT_APIFY_API_KEY) {
    if (sender.tab) return { ok: false, error: "Import an API key from the extension sidebar." };
    const device = await verifiedDevice();
    if (!device) return { ok: false, error: deviceVerificationError ?? "Pair the extension with ActorConsole first." };
    const account = await currentAccount();
    if (!account || account.organizationsStatus === "loading") {
      return { ok: false, error: "Reload Apify Console to load your account and organizations." };
    }
    if (typeof input.workspaceId !== "string" || typeof input.apifyAccountId !== "string") {
      return { ok: false, error: "Choose a workspace and Apify account first." };
    }
    const selected = availableApifyAccount(account, input.apifyAccountId);
    if (!selected) return { ok: false, error: "This Apify account is not in the current session." };
    const workspaces = await deviceWorkspaces(device, selected.id);
    const workspace = workspaces.find((item) => item.id === input.workspaceId);
    if (!workspace || workspace.connectedAccountId !== selected.id || !workspace.browserSessionConfigured) {
      return { ok: false, error: "Connect this account's Console session to the workspace before importing its API key." };
    }
    const tabs = await chrome.tabs.query({ url: "https://console.apify.com/*" });
    const tab = tabs.find((item) => item.active && typeof item.id === "number") ??
      tabs.find((item) => typeof item.id === "number");
    if (typeof tab?.id !== "number") {
      await chrome.tabs.create({ url: apifyConsoleUrl(selected) });
      return { ok: false, error: "Apify Console opened. Sign in, then select Import API key again." };
    }
    let credential: { token?: string; error?: string } | undefined;
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: readApiKeyInConsole,
        args: [selected.id, account.userId, selected.type, workspace.id, workspace.name],
      });
      credential = injected[0]?.result;
      if (!credential?.token) {
        return { ok: false, error: credential?.error ?? "Apify Console did not return an API key." };
      }
      const response = await fetch(
        `${ACTORCONSOLE_DEVICE_API}/workspaces/${encodeURIComponent(workspace.id)}/apify/api-key`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${device.token}`, "content-type": "application/json" },
          credentials: "omit",
          cache: "no-store",
          body: JSON.stringify({ token: credential.token, expectedApifyAccountId: selected.id }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.ok) {
        return { ok: false, error: body?.error?.message ?? "ActorConsole could not save the API key." };
      }
      await notifyAccountChanged(PAIR_CHANGED);
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not import the API key. Reload Apify Console and try again." };
    } finally {
      if (credential) credential.token = "";
    }
  }

  if (input.type === CREATE_WORKSPACE) {
    if (sender.tab) return { ok: false, error: "Create a workspace from the extension sidebar." };
    const device = await verifiedDevice();
    const account = await currentAccount();
    if (!device) return { ok: false, error: deviceVerificationError ?? "Pair ActorConsole before creating a workspace." };
    if (input.connectAfterCreate && !account) {
      return { ok: false, error: "Detect an Apify account before creating and connecting a workspace." };
    }
    if (input.connectAfterCreate && account?.organizationsStatus === "loading") {
      return { ok: false, error: "Wait for the Apify account list to load." };
    }
    const name = input.workspaceName?.trim();
    if (!name || name.length > 100) return { ok: false, error: "Enter a workspace name (up to 100 characters)." };
    const selected = input.connectAfterCreate && account ? selectedApifyAccount(account) : null;
    const response = await fetch(`${ACTORCONSOLE_DEVICE_API}/workspaces`, {
      method: "POST",
      headers: { authorization: `Bearer ${device.token}`, "content-type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ ...(selected ? { apifyUserId: selected.id } : {}), name }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      data?: { id: string; name: string };
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.ok || !body.data) {
      return { ok: false, error: body?.error?.message ?? "Could not create workspace." };
    }
    await notifyAccountChanged(PAIR_CHANGED);
    if (selected) {
      await chrome.tabs.create({ url: `${ACTORCONSOLE_CONNECT_URL}&workspace=${encodeURIComponent(body.data.id)}&apifyAccountId=${encodeURIComponent(selected.id)}&apifyAccountType=${selected.type}` });
    }
    return { ok: true, connectedNext: Boolean(selected) };
  }

  if (input.type === DISCONNECT_WORKSPACE) {
    if (sender.tab) return { ok: false, error: "Disconnect a workspace from the extension sidebar." };
    const device = await verifiedDevice();
    if (!device) return { ok: false, error: deviceVerificationError ?? "Pair the extension with ActorConsole first." };
    if (typeof input.workspaceId !== "string" || !input.workspaceId) {
      return { ok: false, error: "Choose a workspace to disconnect." };
    }
    const response = await fetch(`${ACTORCONSOLE_DEVICE_API}/workspaces/${encodeURIComponent(input.workspaceId)}/apify`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${device.token}` },
      credentials: "omit",
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.ok) {
      return { ok: false, error: body?.error?.message ?? "Could not disconnect this workspace." };
    }
    await notifyAccountChanged(PAIR_CHANGED);
    return { ok: true };
  }

  if (input.type === CHECK_WORKSPACE_CONNECTION) {
    if (sender.tab) return { ok: false, error: "Check a workspace from the extension sidebar." };
    const device = await verifiedDevice();
    if (!device) return { ok: false, error: deviceVerificationError ?? "Pair the extension with ActorConsole first." };
    if (typeof input.workspaceId !== "string" || !input.workspaceId) {
      return { ok: false, error: "Choose a workspace to check." };
    }
    const response = await fetch(`${ACTORCONSOLE_DEVICE_API}/workspaces/${encodeURIComponent(input.workspaceId)}/apify/check`, {
      method: "POST",
      headers: { authorization: `Bearer ${device.token}` },
      credentials: "omit",
      signal: AbortSignal.timeout(22_000),
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      data?: unknown;
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.ok || !body.data) {
      return { ok: false, error: body?.error?.message ?? "Could not check the Apify connection." };
    }
    return { ok: true, check: body.data };
  }

  if (input.type === DELIVER_COOKIE) {
    if (!(await verifiedDevice())) {
      return { ok: false, error: deviceVerificationError ?? "ActorConsole pairing is unavailable. Sign in again." };
    }
    const account = await currentAccount();
    if (!account) {
      return { ok: false, error: "The detected Apify account expired. Reload Apify Console." };
    }
    if (input.expectedApifyUserId !== account.userId) {
      return { ok: false, error: "The Apify account changed. Reload Apify Console and try again." };
    }
    const pending = await currentPending();
    if (!pending) return { ok: false, error: "Start a connection from ActorConsole first." };
    const selected = selectedApifyAccount(account);
    const requested = pending.account ?? { id: account.userId, type: "PERSONAL" as const };
    if (selected.id !== requested.id || selected.type !== requested.type) {
      return { ok: false, error: "The selected Apify account changed. Start the connection again." };
    }
    if (typeof input.apifyRt !== "string" || !input.apifyRt || /[\s;,]/.test(input.apifyRt)) {
      return { ok: false, error: "The ApifyRT cookie is invalid." };
    }

    let apifyRt = input.apifyRt;
    try {
      const response = await chrome.tabs.sendMessage(pending.tabId, {
        type: DELIVER_COOKIE,
        payload: {
          handoffId: pending.handoffId,
          challenge: pending.challenge,
          apifyRt,
          expectedApifyUserId: account.userId,
        },
      });
      return response?.ok
        ? { ok: true }
        : { ok: false, error: response?.error ?? "ActorConsole did not accept the handoff." };
    } catch {
      return { ok: false, error: "Reopen the ActorConsole connection page and try again." };
    } finally {
      apifyRt = "";
      input.apifyRt = "";
    }
  }

  if (input.type === HANDOFF_RESULT) {
    if (!isActorConsoleTab(sender) || !isHandoffResult(input.payload)) {
      return { ok: false, error: "Untrusted handoff result" };
    }
    const pending = await currentPending();
    if (pending?.handoffId !== input.payload.handoffId) {
      return { ok: false, error: "The handoff result does not match" };
    }
    lastResult = input.payload;
    pendingHandoff = null;
    await chrome.storage.session.set({ lastResult });
    await chrome.storage.session.remove("pendingHandoff");
    void chrome.runtime
      .sendMessage({ type: HANDOFF_RESULT, payload: lastResult })
      .catch(() => undefined);
    return { ok: true };
  }

  return { ok: false, error: "Unsupported message" };
}

function isHandoffResult(value: unknown): value is HandoffResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HandoffResult>;
  return (
    typeof candidate.handoffId === "string" &&
    typeof candidate.ok === "boolean" &&
    typeof candidate.message === "string" &&
    candidate.message.length <= 500
  );
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void currentPair().then(async (pair) => {
    if (pair?.tabId !== tabId) return;
    pendingPair = null;
    await chrome.storage.session.remove("pendingPair");
  });
  void currentPending().then(async (pending) => {
    if (pending?.tabId !== tabId) return;
    pendingHandoff = null;
    await chrome.storage.session.remove("pendingHandoff");
    void chrome.runtime.sendMessage({ type: REGISTER_HANDOFF }).catch(() => undefined);
  });
});
