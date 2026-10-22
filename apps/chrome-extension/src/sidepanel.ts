import { selectApifyRtCookie } from "./cookies";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ConnectionFlow } from "./connection-flow";
import { navigateActiveTab } from "./tab-navigation";
import {
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
  REGISTER_HANDOFF,
  UNPAIR,
  type ActorConsoleAccount,
  type ActorConsoleWorkspace,
  type CachedApifyAccount,
  type DetectedApifyAccount,
  type DisplayApifyAccount,
  type HandoffResult,
  type WorkspaceConnectionCheck,
  apifyConsoleUrl,
} from "./messages";

type PanelState = {
  pending: {
    handoffId: string;
    expiresAt: string;
    workspace: { id: string; name: string };
    account: { id: string; type: "PERSONAL" | "ORGANIZATION" } | null;
  } | null;
  result: HandoffResult | null;
  account: DetectedApifyAccount | null;
  cachedAccount: CachedApifyAccount | null;
  actorConsoleAccount: ActorConsoleAccount | null;
  actorConsoleError: string | null;
  storedActorConsoleAccount: ActorConsoleAccount | null;
  workspaces: ActorConsoleWorkspace[];
  workspaceError: string | null;
  pairingStored: boolean;
  cookieCheck: CookieCheck | null;
};

type CookieCheck = {
  userId: string;
  checkedAt: string;
  outcome: "CHECKED" | "DENIED" | "ERROR";
  consoleFound: boolean;
  backendFound: boolean;
  backendExpired: boolean;
};

const COOKIE_CHECK_STORAGE_KEY = "apifyCookieCheck";
const COOKIE_CHECK_FRESH_MS = 10 * 60_000;
const CONNECTION_CHECK_FRESH_MS = 10 * 60_000;
const VIEW_MODE_STORAGE_KEY = "connectionViewMode";
type ViewMode = "box" | "graph";

const welcomeScreen = requiredElement("welcome-screen");
const connectorApp = requiredElement("connector-app");
const welcomeDescription = requiredElement("welcome-description");
const welcomeStatus = requiredElement("welcome-status");
const pairLabel = requiredElement("pair-label");
const welcomeUnpairButton = requiredButton("welcome-unpair");
const welcomeSavedAccount = requiredElement("welcome-saved-account");
const actorConsoleName = requiredElement("actorconsole-name");
const actorConsoleUsername = requiredElement("actorconsole-username");
const actorConsoleEmail = requiredElement("actorconsole-email");
const accountSummaryDetail = requiredElement("account-summary-detail");
const actorConsolePhoto = requiredElement("actorconsole-photo") as HTMLImageElement;
const actorConsoleInitial = requiredElement("actorconsole-initial");
const pairActorConsoleButton = requiredButton("pair-actorconsole");
const unpairActorConsoleButton = requiredButton("unpair-actorconsole");
const accountPill = requiredElement("account-pill");
const accountPhoto = requiredElement("account-photo") as HTMLImageElement;
const accountInitial = requiredElement("account-initial");
const accountName = requiredElement("account-name");
const accountUsername = requiredElement("account-username");
const accountDetail = requiredElement("account-detail");
const targetList = requiredElement("target-list");
const targetNote = requiredElement("target-note");
const targetCount = requiredElement("target-count");
const refreshConnectionsButton = requiredButton("refresh-connections");
const verifyAllButton = requiredButton("verify-all-connections");
const verificationSummary = requiredElement("verification-summary");
const workspacesList = requiredElement("workspaces-list");
const workspacesNote = requiredElement("workspaces-note");
const workspaceCount = requiredElement("workspace-count");
const createWorkspaceForm = requiredElement("create-workspace-form");
const workspaceDialog = requiredElement("workspace-dialog") as HTMLDialogElement;
const disconnectDialog = requiredElement("disconnect-dialog") as HTMLDialogElement;
const disconnectDescription = requiredElement("disconnect-description");
const connectionDialog = requiredElement("connection-dialog") as HTMLDialogElement;
const connectionDialogTitle = requiredElement("connection-dialog-title");
const dialogFeedback = requiredElement("dialog-feedback");
const dialogWorkspacesList = requiredElement("dialog-workspaces-list");
const boxWorkspacePickerStage = requiredElement("box-workspace-picker-stage");
const workspaceName = requiredElement("workspace-name") as HTMLInputElement;
const createWorkspaceButton = requiredButton("create-workspace");
const connectNewWorkspace = requiredElement("connect-new-workspace") as HTMLInputElement;
const workspaceConnectNote = requiredElement("workspace-connect-note");
const boxView = requiredElement("box-view");
const boxWorkspaceStage = requiredElement("box-workspace-stage");
const boxAccountStage = requiredElement("box-account-stage");
const boxConnectionStage = requiredElement("box-connection-stage");
const boxConnectAction = requiredButton("box-connect-action");
const boxRefreshAction = requiredButton("box-refresh-action");
const boxCheckAction = requiredButton("box-check-action");
const boxLinkState = requiredElement("box-link-state");
const boxConsoleState = requiredElement("box-console-state");
const boxApiState = requiredElement("box-api-state");
const boxSettingsAction = requiredButton("box-settings-action");
const boxImportAction = requiredButton("box-import-api-key");
const boxOpenActorConsoleAction = requiredButton("box-open-actorconsole");
const boxOpenApifyAction = requiredButton("box-open-apify-account");
const boxApiKeyNote = requiredElement("box-api-key-note") as HTMLDetailsElement;
const boxDisconnectAction = requiredButton("box-disconnect-action");
const boxPrimaryActions = requiredElement("box-primary-actions");
const boxRelatedActions = requiredElement("box-related-actions");
const boxMoreActions = requiredElement("box-more-actions") as HTMLDetailsElement;
const boxExtraActions = requiredElement("box-extra-actions");
const graphView = requiredElement("graph-view");
const viewBoxButton = requiredButton("view-box");
const viewGraphButton = requiredButton("view-graph");
const graphRoot = createRoot(requiredElement("connection-flow-root"));
const statusElement = requiredElement("status");
const statusCard = statusElement.closest(".status-card") as HTMLElement;
const detailElement = requiredElement("detail");
const workspaceElement = requiredElement("workspace");
const connectButton = requiredButton("connect");
const consentElement = requiredElement("consent");
const consoleStatus = requiredElement("console-status");
const backendStatus = requiredElement("backend-status");
const cookieStatus = requiredElement("cookie-status");
const sessionNote = requiredElement("session-note");
const checkCookieButton = requiredButton("check-cookie");

let panelState: PanelState = {
  pending: null,
  result: null,
  account: null,
  cachedAccount: null,
  actorConsoleAccount: null,
  actorConsoleError: null,
  storedActorConsoleAccount: null,
  workspaces: [],
  workspaceError: null,
  pairingStored: false,
  cookieCheck: null,
};
let welcomeFeedback: { message: string; error: boolean } | null = null;
let viewMode: ViewMode = "box";
let selectedWorkspaceId: string | null = null;
let boxStep: "workspaces" | "accounts" | "connection" = "workspaces";
let boxSelectedAccountId: string | null = null;
let workspaceCreationAccountId: string | null = null;
let stateLoadRevision = 0;
const connectionChecks = new Map<string, WorkspaceConnectionCheck>();
const connectionCheckAttempts = new Map<string, number>();
const connectionCheckErrors = new Map<string, string>();
const connectionCheckRevisions = new Map<string, number>();
const connectionChecksInFlight = new Map<string, Promise<void>>();
let automaticCheckBatchRunning = false;
let connectionCheckEpoch = 0;
let verificationProgress: { checked: number; total: number } | null = null;

accountPhoto.addEventListener("load", () => {
  accountPhoto.hidden = false;
  accountInitial.hidden = true;
});
accountPhoto.addEventListener("error", () => {
  accountPhoto.hidden = true;
  accountInitial.hidden = false;
});
actorConsolePhoto.addEventListener("load", () => {
  actorConsolePhoto.hidden = false;
  actorConsoleInitial.hidden = true;
});
actorConsolePhoto.addEventListener("error", () => {
  actorConsolePhoto.hidden = true;
  actorConsoleInitial.hidden = false;
});

void initializePanel();

connectButton.addEventListener("click", () => void connectCookie());
checkCookieButton.addEventListener("click", () => void checkApifyRtCookie());
createWorkspaceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void createWorkspace();
});
refreshConnectionsButton.addEventListener("click", () => void refreshConnections());
viewBoxButton.addEventListener("click", () => void setViewMode("box", true));
viewGraphButton.addEventListener("click", () => void setViewMode("graph", true));
requiredButton("box-add-workspace").addEventListener("click", openWorkspaceForm);
requiredButton("dialog-add-workspace").addEventListener("click", openWorkspaceForm);
requiredButton("close-create-workspace").addEventListener("click", () => {
  workspaceDialog.close();
});
requiredButton("cancel-disconnect").addEventListener("click", () => disconnectDialog.close());
requiredButton("confirm-disconnect").addEventListener("click", () =>
  disconnectDialog.close("disconnect"),
);
requiredButton("close-connection-dialog").addEventListener("click", () => connectionDialog.close());
connectionDialog.addEventListener("click", (event) => {
  if (event.target === connectionDialog) connectionDialog.close();
});
connectionDialog.addEventListener("close", () => {
  selectedWorkspaceId = null;
  boxSelectedAccountId = null;
  boxStep = "workspaces";
  if (viewMode === "graph") renderGraph();
});
requiredButton("box-back-accounts").addEventListener("click", () => {
  boxStep = "accounts";
  renderBoxStages();
});
boxConnectAction.addEventListener("click", () => void runBoxConnection(false));
boxRefreshAction.addEventListener("click", () => void runBoxConnection(true));
boxCheckAction.addEventListener("click", () => {
  if (selectedWorkspaceId) void checkWorkspaceConnection(selectedWorkspaceId);
});
boxSettingsAction.addEventListener("click", () => {
  if (selectedWorkspaceId) void openWorkspaceSettings(selectedWorkspaceId);
});
boxImportAction.addEventListener("click", () => {
  if (selectedWorkspaceId && boxSelectedAccountId) {
    void importApiKey(selectedWorkspaceId, boxSelectedAccountId);
  }
});
boxOpenActorConsoleAction.addEventListener("click", () => {
  if (selectedWorkspaceId) void openWorkspaceSettings(selectedWorkspaceId);
});
boxOpenApifyAction.addEventListener("click", () => {
  const workspace = panelState.workspaces.find((item) => item.id === selectedWorkspaceId);
  openApifyConsole(boxSelectedAccountId ?? workspace?.connectedAccountId ?? null);
});
boxDisconnectAction.addEventListener("click", () => {
  const workspace = panelState.workspaces.find((item) => item.id === selectedWorkspaceId);
  if (workspace) void disconnectWorkspace(workspace);
});
pairActorConsoleButton.addEventListener("click", () => void pairActorConsole());
unpairActorConsoleButton.addEventListener("click", () => void unpairActorConsole());
welcomeUnpairButton.addEventListener("click", () => void unpairActorConsole());
requiredButton("open-apify").addEventListener("click", () => {
  openApifyConsole(displayedAccount().account?.selectedAccountId ?? null);
});
requiredButton("box-open-apify").addEventListener("click", () => {
  const workspace = panelState.workspaces.find((item) => item.id === selectedWorkspaceId);
  openApifyConsole(
    workspace?.connectedAccountId ?? displayedAccount().account?.selectedAccountId ?? null,
  );
});
requiredButton("box-refresh-accounts").addEventListener("click", () => void refreshConnections());
verifyAllButton.addEventListener("click", () => void verifyAllConnections());

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!message || typeof message !== "object") return;
  const input = message as { type?: string; payload?: HandoffResult };
  if (
    input.type === REGISTER_HANDOFF ||
    input.type === APIFY_SESSION_DETECTED ||
    input.type === APIFY_SESSION_CLEARED ||
    input.type === PAIR_CHANGED
  ) {
    void loadState();
  } else if (input.type === HANDOFF_RESULT && input.payload) {
    connectionCheckEpoch += 1;
    connectionChecks.clear();
    connectionCheckAttempts.clear();
    connectionCheckErrors.clear();
    connectionCheckRevisions.clear();
    panelState = { ...panelState, pending: null, result: input.payload };
    renderState();
    void loadState();
  }
});

window.addEventListener("focus", () => void loadState());
setInterval(() => void loadState(), 60_000);

async function initializePanel() {
  const stored = (await chrome.storage.local
    .get(VIEW_MODE_STORAGE_KEY)
    .catch(() => ({}))) as Record<string, unknown>;
  const saved = stored[VIEW_MODE_STORAGE_KEY] === "graph" ? "graph" : "box";
  setViewMode(saved, false);
  await loadState();
}

function setViewMode(mode: ViewMode, save: boolean) {
  if (save && connectionDialog.open) connectionDialog.close();
  viewMode = mode;
  boxView.hidden = mode !== "box";
  graphView.hidden = mode !== "graph";
  viewBoxButton.setAttribute("aria-pressed", String(mode === "box"));
  viewGraphButton.setAttribute("aria-pressed", String(mode === "graph"));
  document.body.dataset.view = mode;
  if (save) void chrome.storage.local.set({ [VIEW_MODE_STORAGE_KEY]: mode });
  if (mode === "graph" && panelState.actorConsoleAccount) renderGraph();
}

function openWorkspaceForm() {
  const fromAccountPicker = connectionDialog.open && Boolean(boxSelectedAccountId);
  workspaceCreationAccountId = fromAccountPicker
    ? boxSelectedAccountId
    : (panelState.account?.selectedAccountId ?? null);
  if (connectionDialog.open) connectionDialog.close();
  if (fromAccountPicker || !workspaceName.value.trim()) {
    const selected = knownApifyTarget(displayedAccount().account, workspaceCreationAccountId);
    workspaceName.value = selected ? `${selected.name} workspace`.slice(0, 100) : "";
  }
  connectNewWorkspace.checked = Boolean(workspaceCreationAccountId);
  renderWorkspaceFormAvailability();
  if (!workspaceDialog.open) workspaceDialog.showModal();
  workspaceName.focus();
}

function renderWorkspaceFormAvailability() {
  const account = panelState.account;
  const selected =
    account && account.organizationsStatus !== "loading"
      ? knownApifyTarget(account, workspaceCreationAccountId)
      : null;
  const alreadyLinked = Boolean(
    selected && panelState.workspaces.some((item) => item.connectedAccountId === selected.id),
  );
  connectNewWorkspace.disabled = !selected || alreadyLinked;
  if (connectNewWorkspace.disabled) connectNewWorkspace.checked = false;
  workspaceConnectNote.textContent = alreadyLinked
    ? `${selected?.name} is already linked to another workspace. Create this workspace without a link, or choose a different Apify account.`
    : !selected
      ? "Detect an Apify account to connect it after creation."
      : "The connection will continue in ActorConsole after creation.";
  connectNewWorkspace.parentElement?.setAttribute(
    "title",
    alreadyLinked
      ? "This Apify account is already linked to a workspace. Create this workspace first, then choose another account to connect."
      : !selected
        ? "Detect and select an Apify account to connect after creation."
        : "",
  );
}

async function loadState() {
  const revision = ++stateLoadRevision;
  try {
    const [response, storedCheck] = (await Promise.all([
      chrome.runtime.sendMessage({ type: GET_STATE }),
      chrome.storage.session.get(COOKIE_CHECK_STORAGE_KEY).catch(() => ({})),
    ])) as [
      ({ ok: true } & Omit<PanelState, "cookieCheck">) | { ok: false; error: string },
      Record<string, unknown>,
    ];
    // A registration event can refresh the panel while an older workspace
    // lookup is still running. Do not let that older snapshot hide approval.
    if (revision !== stateLoadRevision) return;
    if (!response.ok) throw new Error(response.error);
    if (panelState.actorConsoleAccount?.userId !== response.actorConsoleAccount?.userId) {
      connectionCheckEpoch += 1;
      connectionChecks.clear();
      connectionCheckAttempts.clear();
      connectionCheckErrors.clear();
      connectionCheckRevisions.clear();
    }
    const newHandoff = response.pending && response.pending.handoffId !== panelState.pending?.handoffId;
    panelState = {
      pending: response.pending,
      result: response.result,
      account: response.account,
      cachedAccount: response.cachedAccount ?? null,
      actorConsoleAccount: response.actorConsoleAccount,
      actorConsoleError: response.actorConsoleError ?? null,
      storedActorConsoleAccount: response.storedActorConsoleAccount ?? null,
      workspaces: response.workspaces,
      workspaceError: response.workspaceError,
      pairingStored: response.pairingStored,
      cookieCheck: parseCookieCheck(storedCheck[COOKIE_CHECK_STORAGE_KEY]),
    };
    for (const [workspaceId, check] of connectionChecks) {
      const age = Date.now() - Date.parse(check.checkedAt);
      if (!Number.isFinite(age) || age < 0 || age > CONNECTION_CHECK_FRESH_MS) {
        connectionChecks.delete(workspaceId);
      }
    }
    renderState();
    if (newHandoff) {
      if (connectionDialog.open) connectionDialog.close();
      if (workspaceDialog.open) workspaceDialog.close();
      statusCard.scrollIntoView({ block: "nearest" });
    }
    queueAutomaticConnectionChecks();
  } catch (error) {
    if (revision !== stateLoadRevision) return;
    showError(error instanceof Error ? error.message : "Could not load the connection state.");
  }
}

function renderState() {
  renderActorConsoleAccount();
  if (!panelState.actorConsoleAccount) {
    if (connectionDialog.open) connectionDialog.close();
    if (workspaceDialog.open) workspaceDialog.close();
    renderWelcomeState();
    return;
  }
  welcomeFeedback = null;
  welcomeScreen.hidden = true;
  connectorApp.hidden = false;
  document.body.dataset.mode = "connected";
  renderAccount();
  const apifyIdentity = displayedAccount().account;
  accountSummaryDetail.textContent = apifyIdentity?.username ? `@${apifyIdentity.username}` : apifyIdentity?.displayName ?? "Sign-in needed";
  renderTargets();
  renderWorkspaces();
  renderBoxStages();
  renderWorkspaceFormAvailability();
  renderGraph();
  refreshConnectionsButton.hidden = !panelState.actorConsoleAccount;
  verifyAllButton.hidden = !panelState.actorConsoleAccount;
  const selectedTarget = panelState.account ? selectedApifyTarget(panelState.account) : null;
  const pendingTarget =
    panelState.pending?.account ??
    (panelState.account ? { id: panelState.account.userId, type: "PERSONAL" as const } : null);
  const pendingMatchesSelection = Boolean(
    selectedTarget &&
    pendingTarget &&
    selectedTarget.id === pendingTarget.id &&
    selectedTarget.type === pendingTarget.type,
  );
  connectButton.hidden =
    !panelState.pending ||
    !panelState.account ||
    !panelState.actorConsoleAccount ||
    !pendingMatchesSelection;
  consentElement.hidden = connectButton.hidden;
  workspaceElement.hidden = !panelState.pending;
  statusCard.hidden = !panelState.pending && !panelState.result && Boolean(panelState.account);
  statusCard.dataset.tone = "neutral";
  if (panelState.pending) {
    statusElement.textContent = pendingMatchesSelection
      ? "Workspace ready"
      : "Account selection changed";
    detailElement.textContent = pendingMatchesSelection
      ? `Approve the connection before ${formatExpiry(panelState.pending.expiresAt)}.`
      : "Choose the account used when this handoff started, or start a new connection.";
    workspaceElement.textContent = panelState.pending.workspace.name;
    return;
  }
  if (panelState.result) {
    statusElement.textContent = panelState.result.ok ? "Connected" : "Connection failed";
    detailElement.textContent = panelState.result.message;
    statusCard.dataset.tone = panelState.result.ok ? "success" : "error";
    return;
  }
  statusElement.textContent =
    panelState.account?.organizationsStatus === "loading"
      ? "Loading Apify accounts"
      : panelState.account
        ? "Ready to connect"
        : panelState.cachedAccount
          ? "Apify session needed"
          : "Waiting for Apify";
  detailElement.textContent = panelState.account
    ? "Choose an Apify account and workspace to connect."
    : panelState.cachedAccount
      ? "Your saved account list is shown below. Open Apify Console to refresh access before connecting."
      : "Sign in to Apify Console and reload the page to detect your account.";
}

function displayedAccount(): { account: DisplayApifyAccount | null; listCached: boolean } {
  const live = panelState.account;
  const saved = panelState.cachedAccount;
  if (!live) return { account: saved, listCached: Boolean(saved) };
  if (saved?.userId !== live.userId) return { account: live, listCached: false };
  const listCached =
    live.organizationsStatus !== "ready" && saved.organizations.length > live.organizations.length;
  return {
    account: {
      ...live,
      username: live.username ?? saved.username,
      displayName: live.displayName ?? saved.displayName,
      pictureUrl: live.pictureUrl ?? saved.pictureUrl,
      organizations: listCached ? saved.organizations : live.organizations,
    },
    listCached,
  };
}

function selectedApifyTarget(account: DisplayApifyAccount) {
  const organization = account.organizations.find((item) => item.id === account.selectedAccountId);
  return organization
    ? { id: organization.id, type: "ORGANIZATION" as const, name: organization.name }
    : {
        id: account.userId,
        type: "PERSONAL" as const,
        name: account.displayName || account.username || "Personal account",
      };
}

function knownApifyTarget(account: DisplayApifyAccount | null, accountId: string | null) {
  if (!account || !accountId) return null;
  if (accountId === account.userId)
    return {
      id: account.userId,
      type: "PERSONAL" as const,
      name: account.displayName || account.username || "Personal account",
    };
  const organization = account.organizations.find((item) => item.id === accountId);
  return organization
    ? { id: organization.id, type: "ORGANIZATION" as const, name: organization.name }
    : null;
}

function renderTargets() {
  targetList.replaceChildren();
  const { account, listCached } = displayedAccount();
  targetCount.textContent = account
    ? `${account.organizations.length + 1} ${listCached ? "saved" : "available"}`
    : "";
  if (!account) {
    targetNote.textContent = "Open Apify Console, sign in, then refresh the account list.";
    return;
  }
  targetNote.textContent = listCached
    ? panelState.account
      ? "Showing saved organizations while Apify refreshes the list. Reopen Console before connecting one."
      : "Saved from your last Apify session. Open Console to refresh access before connecting."
    : panelState.account?.organizationsStatus === "loading"
      ? "Your personal account is ready. Loading organizations…"
      : panelState.account?.organizationsStatus === "unavailable"
        ? "The organization list could not be loaded. Refresh to try again; the personal account is still shown."
        : panelState.account?.organizationsStatus === "limited"
          ? "Only the organization currently open in Apify Console could be identified."
          : "Choose the personal account or organization for this workspace.";
  const choices = [
    {
      id: account.userId,
      name: account.displayName || account.username || "Personal account",
      type: "PERSONAL" as const,
      username: account.username,
      pictureUrl: account.pictureUrl,
    },
    ...account.organizations.map((item) => ({
      id: item.id,
      name: item.name,
      type: "ORGANIZATION" as const,
      username: item.username,
      pictureUrl: item.pictureUrl,
    })),
  ].sort(
    (left, right) =>
      Number(
        right.id ===
          panelState.workspaces.find((item) => item.id === selectedWorkspaceId)?.connectedAccountId,
      ) -
      Number(
        left.id ===
          panelState.workspaces.find((item) => item.id === selectedWorkspaceId)?.connectedAccountId,
      ),
  );
  for (const choice of choices) {
    const linkedWorkspaces = panelState.workspaces.filter(
      (workspace) => workspace.connectedAccountId === choice.id,
    ).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "target-choice";
    button.setAttribute("aria-pressed", String(choice.id === boxSelectedAccountId));
    const avatar = document.createElement("span");
    avatar.className = "target-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = choice.name.charAt(0).toUpperCase();
    const pictureUrl = safePictureUrl(choice.pictureUrl);
    if (pictureUrl) {
      const photo = document.createElement("img");
      photo.alt = "";
      photo.referrerPolicy = "no-referrer";
      photo.addEventListener("load", () => {
        avatar.replaceChildren(photo);
      });
      photo.src = pictureUrl;
    }
    const copy = document.createElement("span");
    copy.className = "target-copy";
    const name = document.createElement("strong");
    name.textContent = choice.name;
    const detail = document.createElement("small");
    const linkedNames = panelState.workspaces
      .filter((workspace) => workspace.connectedAccountId === choice.id)
      .map((workspace) => workspace.name);
    const workspaceLabel = linkedWorkspaces
      ? ` · Linked to ${linkedNames.join(", ")}`
      : " · No saved link";
    detail.textContent = `${choice.type === "PERSONAL" ? "Personal" : "Organization"}${choice.username ? ` · @${choice.username}` : ""}${workspaceLabel}`;
    copy.append(name, detail);
    button.append(avatar, copy);
    button.addEventListener("click", () => {
      boxSelectedAccountId = choice.id;
      boxStep = "connection";
      renderBoxStages();
      renderGraph();
    });
    targetList.append(button);
  }
  const workspace = panelState.workspaces.find((item) => item.id === selectedWorkspaceId);
  if (
    workspace?.connectedAccountId &&
    !choices.some((item) => item.id === workspace.connectedAccountId)
  ) {
    const missing = document.createElement("button");
    missing.type = "button";
    missing.disabled = true;
    missing.className = "target-choice missing-target";
    missing.textContent = `Saved account ${workspace.apifyUsername ? `@${workspace.apifyUsername}` : workspace.connectedAccountId} · not in this Apify session`;
    targetList.prepend(missing);
  }
}

async function selectTarget(apifyAccountId: string): Promise<boolean> {
  if (panelState.account?.selectedAccountId === apifyAccountId) return true;
  try {
    const response = (await chrome.runtime.sendMessage({
      type: SELECT_APIFY_ACCOUNT,
      apifyAccountId,
    })) as {
      ok: boolean;
      error?: string;
    };
    if (!response.ok) throw new Error(response.error ?? "Could not select this Apify account.");
    await loadState();
    return true;
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not select this Apify account.");
    return false;
  }
}

function renderActorConsoleAccount() {
  const account = panelState.actorConsoleAccount;
  actorConsoleName.textContent = account?.name || account?.username || account?.email || "Not signed in";
  actorConsoleUsername.hidden = !account?.username;
  actorConsoleUsername.textContent = account?.username ? `@${account.username}` : "";
  actorConsoleEmail.textContent = account
    ? account.email
    : panelState.pairingStored
      ? "Pairing saved, but ActorConsole could not verify it."
      : "Sign in to pair this extension with one account.";
  pairActorConsoleButton.hidden = Boolean(account);
  pairLabel.textContent = panelState.pairingStored
    ? "Retry connection"
    : "Sign in with ActorConsole";
  unpairActorConsoleButton.hidden = !account && !panelState.pairingStored;
  welcomeUnpairButton.hidden = !panelState.pairingStored || Boolean(account);
  const pictureUrl = safePictureUrl(account?.image ?? null);
  actorConsoleInitial.textContent = (account?.name || account?.username || "?")
    .charAt(0)
    .toUpperCase();
  if (pictureUrl) {
    if (actorConsolePhoto.src !== pictureUrl) {
      actorConsolePhoto.hidden = true;
      actorConsoleInitial.hidden = false;
      actorConsolePhoto.src = pictureUrl;
    }
  } else {
    actorConsolePhoto.hidden = true;
    actorConsolePhoto.removeAttribute("src");
    actorConsoleInitial.hidden = false;
  }
}

function renderWelcomeState() {
  connectorApp.hidden = true;
  welcomeScreen.hidden = false;
  document.body.dataset.mode = "welcome";
  pairActorConsoleButton.hidden = false;
  welcomeDescription.textContent = panelState.pairingStored
    ? "Your saved ActorConsole connection needs verification."
    : "Sign in to connect your Apify accounts and manage your workspaces.";
  const message =
    welcomeFeedback?.message ??
    panelState.actorConsoleError ??
    (panelState.pairingStored
      ? "Retry the connection, or disconnect the saved pairing and sign in again."
      : null);
  welcomeStatus.hidden = !message;
  welcomeStatus.textContent = message ?? "";
  welcomeStatus.dataset.tone =
    (welcomeFeedback ? welcomeFeedback.error : panelState.actorConsoleError || panelState.pairingStored) ? "error" : "info";
  welcomeUnpairButton.hidden = !panelState.pairingStored;
  const saved = panelState.storedActorConsoleAccount;
  welcomeSavedAccount.hidden = !panelState.pairingStored || !saved;
  welcomeSavedAccount.textContent = saved
    ? `Saved sign-in: ${saved.name || saved.username || saved.email}${saved.email && saved.email !== (saved.name || saved.username || saved.email) ? ` · ${saved.email}` : ""}`
    : "";
}

function renderWorkspaces() {
  const { actorConsoleAccount, workspaces, workspaceError } = panelState;
  workspacesList.replaceChildren();
  const linkedCount = workspaces.filter((item) => item.connectedAccountId).length;
  const saved = workspaces.filter(hasSavedConnection);
  const checked = saved.filter((item) => connectionChecks.has(item.id)).length;
  const unavailable = saved.filter((item) => connectionCheckErrors.has(item.id)).length;
  const ready = saved.filter((item) => {
    const check = connectionChecks.get(item.id);
    return check?.confirmed && check.api === "VALID";
  }).length;
  const lastCheckedAt = saved.reduce((latest, item) => {
    const timestamp = Date.parse(connectionChecks.get(item.id)?.checkedAt ?? "");
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
  verificationSummary.textContent = verificationProgress
    ? `Checking connections ${verificationProgress.checked} of ${verificationProgress.total}…`
    : saved.length
      ? `${ready} fully verified · ${checked} of ${saved.length} checked${unavailable ? ` · ${unavailable} unavailable` : ""}${lastCheckedAt ? ` · Last check ${new Date(lastCheckedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}.`
      : "Connect a workspace to an Apify account to see its connection health.";
  verifyAllButton.disabled = !saved.length || Boolean(verificationProgress);
  workspaceCount.textContent = actorConsoleAccount
    ? workspaceError
      ? "Unavailable"
      : `${workspaces.length} total · ${linkedCount} linked`
    : "";
  workspacesNote.textContent = !actorConsoleAccount
    ? "Pair your ActorConsole account to see all its workspaces."
    : workspaceError
      ? workspaceError
      : !workspaces.length
        ? "No workspaces yet. Add one below."
        : "Select a workspace to see the Apify accounts available to it.";
  if (!actorConsoleAccount || workspaceError) return;
  for (const workspace of workspaces) {
    const item = document.createElement("div");
    item.className = "workspace-choice-row";
    const row = document.createElement("button");
    row.type = "button";
    row.className = "workspace-choice";
    row.dataset.connection = graphConnectionKind(workspace);
    const title = document.createElement("strong");
    title.textContent = workspace.name;
    const detail = document.createElement("small");
    const savedTarget = knownApifyTarget(displayedAccount().account, workspace.connectedAccountId);
    detail.textContent = savedTarget
      ? `Saved link · ${savedTarget.name}`
      : workspace.connectedAccountId
        ? `Saved link · ${workspace.apifyUsername ? `@${workspace.apifyUsername}` : `Account ID ${workspace.connectedAccountId}`}`
        : workspace.connection === "AVAILABLE"
          ? "No Apify account connected"
          : "Saved credential needs account identification";
    const health = document.createElement("small");
    health.className = "workspace-health";
    const check = connectionChecks.get(workspace.id);
    health.textContent = workspaceStatusLabel(workspace);
    health.dataset.ready = check?.confirmed
      ? "true"
      : graphConnectionKind(workspace) === "attention"
        ? "false"
        : "neutral";
    const arrow = document.createElement("span");
    arrow.className = "choice-arrow";
    arrow.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="m10 14 11-11"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';
    arrow.setAttribute("aria-hidden", "true");
    row.append(title, detail, health, arrow);
    row.setAttribute("aria-label", `Open ${workspace.name} in ActorConsole`);
    row.addEventListener("click", () => void openWorkspaceSettings(workspace.id));

    const manage = document.createElement("button");
    manage.type = "button";
    manage.className = "workspace-manage";
    manage.title = `Manage ${workspace.name} Apify connection`;
    manage.setAttribute("aria-label", manage.title);
    manage.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg><span>Manage</span>';
    manage.addEventListener("click", () => openWorkspaceConnection(workspace));
    item.append(row, manage);
    workspacesList.append(item);
  }
}

function renderBoxStages() {
  const workspace = panelState.workspaces.find((item) => item.id === selectedWorkspaceId);
  if (boxStep !== "workspaces" && !workspace && !boxSelectedAccountId) {
    connectionDialog.close();
    return;
  }
  boxWorkspaceStage.hidden = false;
  boxWorkspacePickerStage.hidden = boxStep !== "workspaces";
  boxAccountStage.hidden = boxStep !== "accounts";
  boxConnectionStage.hidden = boxStep !== "connection";
  connectionDialogTitle.textContent =
    boxStep === "workspaces"
      ? "Choose a workspace"
      : boxStep === "accounts"
        ? "Choose an Apify account"
        : "Connection details";
  if (workspace) requiredElement("box-selected-workspace").textContent = `For ${workspace.name}`;
  if (boxStep === "workspaces") renderDialogWorkspaces();
  if (boxStep === "accounts") renderTargets();
  if (boxStep === "connection") renderBoxConnection();
}

function openConnectionDialog(
  step: "workspaces" | "accounts" | "connection",
  workspaceId: string | null,
  accountId: string | null = null,
) {
  selectedWorkspaceId = workspaceId;
  boxSelectedAccountId = accountId;
  boxStep = step;
  dialogFeedback.hidden = true;
  boxMoreActions.open = false;
  boxApiKeyNote.open = false;
  if (!connectionDialog.open) connectionDialog.showModal();
  renderBoxStages();
  if (viewMode === "graph") renderGraph();
  const workspace = panelState.workspaces.find((item) => item.id === workspaceId);
  if (
    workspace &&
    hasSavedConnection(workspace) &&
    !connectionChecks.has(workspace.id) &&
    !connectionChecksInFlight.has(workspace.id) &&
    Date.now() - (connectionCheckAttempts.get(workspace.id) ?? 0) >= CONNECTION_CHECK_FRESH_MS
  ) {
    void checkWorkspaceConnection(workspace.id, false);
  }
}

function renderDialogWorkspaces() {
  dialogWorkspacesList.replaceChildren();
  const target = knownApifyTarget(displayedAccount().account, boxSelectedAccountId);
  requiredElement("dialog-selected-account").textContent = target
    ? `For ${target.name}`
    : "Choose an Apify account first";
  for (const workspace of panelState.workspaces) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "workspace-choice";
    const title = document.createElement("strong");
    title.textContent = workspace.name;
    const detail = document.createElement("small");
    detail.textContent = workspaceStatusLabel(workspace);
    row.append(title, detail);
    row.addEventListener("click", () => {
      selectedWorkspaceId = workspace.id;
      boxStep = "connection";
      renderBoxStages();
      renderGraph();
    });
    dialogWorkspacesList.append(row);
  }
}

function renderBoxConnection() {
  const workspace = panelState.workspaces.find((item) => item.id === selectedWorkspaceId);
  const knownTarget = knownApifyTarget(panelState.account, boxSelectedAccountId);
  const target =
    knownApifyTarget(displayedAccount().account, boxSelectedAccountId) ??
    (workspace?.connectedAccountId && workspace.connectedAccountId === boxSelectedAccountId
      ? {
          id: workspace.connectedAccountId,
          name: workspace.apifyUsername ? `@${workspace.apifyUsername}` : "Saved Apify account",
        }
      : null);
  if (!workspace || !target) {
    boxStep = "accounts";
    renderBoxStages();
    return;
  }
  requiredElement("box-connection-workspace").textContent = workspace.name;
  requiredElement("box-connection-account").textContent = target.name;
  const status = requiredElement("box-connection-status");
  const detail = requiredElement("box-connection-detail");
  const result = requiredElement("box-check-result");
  const check = connectionChecks.get(workspace.id);
  const hasCredential = Boolean(
    workspace.connectedAccountId ||
    workspace.apiKeyConfigured ||
    workspace.uiTokenConfigured ||
    workspace.browserSessionConfigured,
  );
  const savedMatches = workspace.connectedAccountId === target.id;
  const accountAccessNeedsAttention =
    check?.accountAccess === "INVALID" ||
    check?.accountAccess === "ERROR" ||
    check?.accountAccess === "UNIDENTIFIED";
  boxLinkState.textContent = savedMatches
    ? check?.accountAccess === "VALID"
      ? "Access verified"
      : accountAccessNeedsAttention
        ? "Access needs attention"
        : "Saved link"
    : workspace.connectedAccountId
      ? "Linked elsewhere"
      : "Not linked";
  boxLinkState.dataset.tone =
    savedMatches && check?.accountAccess === "VALID"
      ? "success"
      : accountAccessNeedsAttention || (workspace.connectedAccountId && !savedMatches)
        ? "attention"
        : "neutral";
  boxConsoleState.textContent = check
    ? check.console === "VALID"
      ? "Working"
      : check.console === "MISSING"
        ? "Missing"
        : "Needs reconnection"
    : workspace.browserSessionConfigured
      ? "Saved · checking"
      : "Not connected";
  boxConsoleState.dataset.tone = check
    ? check.console === "VALID"
      ? "success"
      : "attention"
    : "neutral";
  boxApiState.textContent = check
    ? check.api === "VALID"
      ? "Ready"
      : check.api === "MISSING"
        ? "Key needed"
        : "Key needs attention"
    : workspace.apiKeyConfigured
      ? "Saved · checking"
      : "Key needed";
  boxApiState.dataset.tone = check ? (check.api === "VALID" ? "success" : "attention") : "neutral";
  const linkedElsewhere = panelState.workspaces.find(
    (item) => item.id !== workspace.id && item.connectedAccountId === target.id,
  );
  boxConnectAction.hidden = true;
  boxRefreshAction.hidden = true;
  boxOpenActorConsoleAction.textContent = "Open workspace ↗";
  boxOpenApifyAction.textContent = "Open Apify account ↗";
  boxCheckAction.hidden = !hasCredential || Boolean(workspace.connectedAccountId && !savedMatches);
  const checking = connectionChecksInFlight.has(workspace.id);
  boxCheckAction.disabled = checking;
  boxCheckAction.dataset.checking = String(checking);
  boxCheckAction.setAttribute(
    "aria-label",
    checking ? "Checking connection" : "Recheck connection",
  );
  boxCheckAction.title = checking ? "Checking connection" : "Recheck connection";
  boxSettingsAction.hidden = !hasCredential;
  boxSettingsAction.textContent = workspace.apiKeyConfigured
    ? "Update API key manually"
    : "Enter API key manually";
  boxImportAction.hidden = !savedMatches || !workspace.browserSessionConfigured || !knownTarget;
  boxImportAction.textContent = workspace.apiKeyConfigured
    ? "Replace with dedicated API key"
    : "Create API key for ActorConsole";
  boxDisconnectAction.hidden = !hasCredential;
  boxDisconnectAction.textContent = "Disconnect workspace";
  const checkError = connectionCheckErrors.get(workspace.id);
  result.hidden = (!check && !checkError) || Boolean(workspace.connectedAccountId && !savedMatches);
  if (check) {
    result.dataset.tone = check.confirmed && check.api === "VALID" ? "success" : "attention";
    result.textContent = `Last checked ${new Date(check.checkedAt).toLocaleString()}. The three states above show what works now.`;
  } else if (checkError) {
    result.dataset.tone = "attention";
    result.textContent = `Connection check unavailable: ${checkError}`;
  }
  let primaryAction: HTMLButtonElement | null = null;
  if (savedMatches && check?.confirmed && check.api === "VALID") {
    status.textContent = "Connection verified";
    status.dataset.tone = "linked";
    detail.textContent = check.message;
    boxRefreshAction.textContent = knownTarget
      ? "Refresh Console session"
      : "Open Apify account to refresh";
    boxRefreshAction.hidden = false;
    primaryAction = boxOpenActorConsoleAction;
  } else if (!knownTarget) {
    status.textContent = "Refresh Apify access";
    status.dataset.tone = "attention";
    detail.textContent =
      "This account is shown from the saved list. Open it in Apify Console so the extension can confirm current access before connecting.";
    boxRefreshAction.textContent = "Open Apify account to reconnect";
    boxRefreshAction.hidden = false;
    primaryAction = boxRefreshAction;
  } else if (savedMatches) {
    const sessionValid =
      Boolean(knownTarget) &&
      (check
        ? check.console === "VALID" &&
          !["INVALID", "ERROR", "UNIDENTIFIED"].includes(check.accountAccess)
        : workspace.browserSessionConfigured && workspace.browserSessionStatus === "VALID");
    const apiNeedsAction =
      !workspace.apiKeyConfigured ||
      isUnhealthyCredential(workspace.apiTokenStatus) ||
      Boolean(check && check.api !== "VALID");
    boxRefreshAction.textContent = !knownTarget
      ? "Open Apify Console to reconnect"
      : sessionValid
        ? "Refresh Console session"
        : "Reconnect Console session";
    boxRefreshAction.hidden = false;
    if (check?.confirmed && check.api === "VALID") {
      status.textContent = "Connection verified";
      status.dataset.tone = "linked";
      detail.textContent = check.message;
      primaryAction = boxOpenActorConsoleAction;
    } else if (!sessionValid) {
      status.textContent = "Console session needs reconnection";
      status.dataset.tone = "attention";
      detail.textContent =
        check?.message ??
        "The saved Apify Console session is unavailable. Reconnect this account to continue.";
      primaryAction = boxRefreshAction;
    } else if (apiNeedsAction) {
      status.textContent = workspace.apiKeyConfigured
        ? "API key needs replacing"
        : "API key needed";
      status.dataset.tone = "attention";
      detail.textContent =
        check?.message ??
        "The Console session is connected. Add a dedicated API key to run Actors and use Apify APIs.";
      primaryAction = boxImportAction.hidden ? boxSettingsAction : boxImportAction;
    } else {
      status.textContent = "Saved connection";
      status.dataset.tone = "neutral";
      detail.textContent = "This saved link is checked automatically. Its status will update here.";
      primaryAction = boxOpenActorConsoleAction;
    }
  } else if (workspace.connectedAccountId) {
    const saved = knownApifyTarget(displayedAccount().account, workspace.connectedAccountId);
    status.textContent = "Linked to a different account";
    status.dataset.tone = "attention";
    detail.textContent = `This workspace is saved to ${saved?.name ?? workspace.apifyUsername ?? workspace.connectedAccountId}. Choose that account or disconnect the saved link before switching.`;
  } else if (hasCredential) {
    status.textContent = "Saved account needs review";
    status.dataset.tone = "attention";
    detail.textContent =
      "ActorConsole has a saved credential but cannot identify its Apify account. Review the workspace settings before connecting another account.";
    primaryAction = boxSettingsAction;
  } else if (linkedElsewhere) {
    status.textContent = "Account already linked";
    status.dataset.tone = "attention";
    detail.textContent = `${target.name} is already linked to ${linkedElsewhere.name}. Choose another Apify account or disconnect the old workspace first.`;
  } else {
    status.textContent = "Ready to connect";
    status.dataset.tone = "neutral";
    detail.textContent =
      "ActorConsole will open in the current tab to complete the connection. You can check it here afterward.";
    boxConnectAction.hidden = false;
    boxConnectAction.textContent = "Connect account";
    primaryAction = boxConnectAction;
  }
  boxApiKeyNote.hidden = primaryAction !== boxImportAction;
  arrangeConnectionActions(primaryAction);
}

function arrangeConnectionActions(primaryAction: HTMLButtonElement | null) {
  boxPrimaryActions.replaceChildren();
  boxRelatedActions.replaceChildren();
  boxExtraActions.replaceChildren();
  for (const action of [
    boxConnectAction,
    boxImportAction,
    boxRefreshAction,
    boxSettingsAction,
    boxOpenActorConsoleAction,
  ]) {
    action.classList.remove("connection-primary-button");
    if (action === primaryAction) {
      action.classList.add("connection-primary-button");
      boxPrimaryActions.append(action);
    } else if (action === boxOpenActorConsoleAction) {
      boxRelatedActions.append(action);
    } else {
      boxExtraActions.append(action);
    }
  }
  boxRelatedActions.append(boxOpenApifyAction);
  boxExtraActions.append(boxDisconnectAction);
  boxPrimaryActions.hidden = !primaryAction || primaryAction.hidden;
  boxMoreActions.hidden = !Array.from(boxExtraActions.children).some(
    (item) => !(item as HTMLElement).hidden,
  );
}

async function runBoxConnection(refresh: boolean) {
  const workspace = panelState.workspaces.find((item) => item.id === selectedWorkspaceId);
  const target = knownApifyTarget(panelState.account, boxSelectedAccountId);
  if (!workspace) return;
  if (refresh && !target) {
    openApifyConsole(boxSelectedAccountId ?? workspace.connectedAccountId);
    connectionDialog.close();
    return;
  }
  if (!target) return;
  const accountId = refresh ? workspace.connectedAccountId : target.id;
  if (!accountId || !knownApifyTarget(panelState.account, accountId)) return;
  if (!(await selectTarget(accountId))) return;
  await openActorConsole(workspace.id, accountId);
}

function graphConnectionKind(workspace: ActorConsoleWorkspace): "linked" | "attention" | "unknown" {
  if (!workspace.connectedAccountId) return "unknown";
  const check = connectionChecks.get(workspace.id);
  if (check) return check.confirmed && check.api === "VALID" ? "linked" : "attention";
  return workspace.browserSessionConfigured &&
    workspace.browserSessionStatus === "VALID" &&
    workspace.apiKeyConfigured &&
    !isUnhealthyCredential(workspace.apiTokenStatus)
    ? "unknown"
    : "attention";
}

function workspaceStatusLabel(workspace: ActorConsoleWorkspace): string {
  if (connectionChecksInFlight.has(workspace.id)) return "Checking connection…";
  if (connectionCheckErrors.has(workspace.id)) return "Check unavailable · retry";
  const check = connectionChecks.get(workspace.id);
  if (check) {
    if (!check.confirmed) return "Connection needs attention";
    return check.api === "VALID"
      ? "Fully verified"
      : check.api === "MISSING"
        ? "Console verified · API key needed"
        : "API key needs refresh";
  }
  if (workspace.connectedAccountId) {
    if (!workspace.browserSessionConfigured || workspace.browserSessionStatus !== "VALID")
      return "Reconnect Console session";
    if (!workspace.apiKeyConfigured) return "Console saved · API key needed";
    if (isUnhealthyCredential(workspace.apiTokenStatus)) return "API key needs refresh";
    return "Saved link · awaiting check";
  }
  if (workspace.apiKeyConfigured) return "API key only · connect Console";
  return "Not connected";
}

function renderGraph() {
  const actor = panelState.actorConsoleAccount;
  const { account, listCached } = displayedAccount();
  if (!actor) {
    graphRoot.render(null);
    return;
  }
  const workspaces = panelState.workspaces;
  if (selectedWorkspaceId && !workspaces.some((item) => item.id === selectedWorkspaceId)) {
    selectedWorkspaceId = null;
  }
  const linkedCount = workspaces.filter((item) => item.connectedAccountId).length;
  const confirmedCount = workspaces.filter(
    (item) => connectionChecks.get(item.id)?.confirmed,
  ).length;
  requiredElement("graph-summary").textContent = account
    ? `${workspaces.length} workspaces · ${linkedCount} saved links${confirmedCount ? ` · ${confirmedCount} checked now` : ""}${listCached ? " · saved Apify list" : ""}`
    : `${workspaces.length} workspaces · ${linkedCount} saved links · Apify sign-in needed`;
  graphRoot.render(
    createElement(ConnectionFlow, {
      actor,
      account,
      liveSession: Boolean(panelState.account),
      accountListCached: listCached,
      workspaces,
      workspaceError: panelState.workspaceError,
      checks: new Map(connectionChecks),
      selectedWorkspaceId,
      selectedAccountId: boxSelectedAccountId,
      onWorkspaceOpen: (workspaceId: string) => void openWorkspaceSettings(workspaceId),
      onWorkspaceManage: (workspaceId: string) => {
        const workspace = workspaces.find((item) => item.id === workspaceId);
        if (workspace) openWorkspaceConnection(workspace);
      },
      onAccountManage: (accountId: string) => openConnectionDialog("workspaces", null, accountId),
      onConnectionManage: (workspaceId: string, accountId: string) =>
        openConnectionDialog("connection", workspaceId, accountId),
      onAddWorkspace: openWorkspaceForm,
      onOpenApify: openApifyConsole,
    }),
  );
}

function openWorkspaceConnection(workspace: ActorConsoleWorkspace) {
  if (workspace.connectedAccountId)
    openConnectionDialog("connection", workspace.id, workspace.connectedAccountId);
  else openConnectionDialog("accounts", workspace.id);
}

function renderConnectionStatuses(workspaceId: string) {
  renderWorkspaces();
  if (connectionDialog.open && boxStep === "connection" && selectedWorkspaceId === workspaceId)
    renderBoxConnection();
  renderGraph();
}

function hasSavedConnection(workspace: ActorConsoleWorkspace): boolean {
  return Boolean(
    workspace.connectedAccountId ||
    workspace.apiKeyConfigured ||
    workspace.uiTokenConfigured ||
    workspace.browserSessionConfigured,
  );
}

function queueAutomaticConnectionChecks() {
  if (automaticCheckBatchRunning || !panelState.actorConsoleAccount || panelState.workspaceError)
    return;
  const actorUserId = panelState.actorConsoleAccount.userId;
  const now = Date.now();
  const workspaceIds = panelState.workspaces
    .filter(
      (workspace) =>
        hasSavedConnection(workspace) &&
        !connectionChecks.has(workspace.id) &&
        !connectionChecksInFlight.has(workspace.id) &&
        now - (connectionCheckAttempts.get(workspace.id) ?? 0) >= CONNECTION_CHECK_FRESH_MS,
    )
    .map((workspace) => workspace.id);
  if (!workspaceIds.length) return;
  automaticCheckBatchRunning = true;
  void (async () => {
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(2, workspaceIds.length) }, async () => {
        while (next < workspaceIds.length) {
          const workspaceId = workspaceIds[next++];
          if (panelState.actorConsoleAccount?.userId !== actorUserId) break;
          if (
            !panelState.workspaces.some(
              (item) => item.id === workspaceId && hasSavedConnection(item),
            )
          )
            continue;
          await checkWorkspaceConnection(workspaceId, false);
        }
      }),
    );
  })()
    .catch(() => undefined)
    .finally(() => {
      automaticCheckBatchRunning = false;
      queueAutomaticConnectionChecks();
    });
}

async function checkWorkspaceConnection(workspaceId: string, manual = true) {
  const existing = connectionChecksInFlight.get(workspaceId);
  if (existing) {
    await existing;
    if (!manual) return;
  }
  const actorUserId = panelState.actorConsoleAccount?.userId;
  const epoch = connectionCheckEpoch;
  const revision = connectionCheckRevisions.get(workspaceId) ?? 0;
  connectionCheckAttempts.set(workspaceId, Date.now());
  connectionCheckErrors.delete(workspaceId);
  const request = performWorkspaceConnectionCheck(
    workspaceId,
    actorUserId,
    epoch,
    revision,
    manual,
  );
  connectionChecksInFlight.set(workspaceId, request);
  if (connectionDialog.open && boxStep === "connection" && selectedWorkspaceId === workspaceId)
    renderBoxConnection();
  try {
    await request;
  } finally {
    if (connectionChecksInFlight.get(workspaceId) === request) {
      connectionChecksInFlight.delete(workspaceId);
    }
    // Render after removing the in-flight marker. Otherwise list rows keep
    // saying "Checking connection…" even though a result has arrived.
    if (panelState.actorConsoleAccount?.userId === actorUserId && epoch === connectionCheckEpoch)
      renderConnectionStatuses(workspaceId);
  }
}

async function performWorkspaceConnectionCheck(
  workspaceId: string,
  actorUserId: string | undefined,
  epoch: number,
  revision: number,
  manual: boolean,
) {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: CHECK_WORKSPACE_CONNECTION,
      workspaceId,
    })) as { ok: boolean; check?: WorkspaceConnectionCheck; error?: string };
    if (!response.ok || !response.check)
      throw new Error(response.error ?? "Could not check the connection.");
    if (
      panelState.actorConsoleAccount?.userId !== actorUserId ||
      epoch !== connectionCheckEpoch ||
      revision !== (connectionCheckRevisions.get(workspaceId) ?? 0) ||
      !panelState.workspaces.some((item) => item.id === workspaceId && hasSavedConnection(item))
    )
      return;
    connectionChecks.set(workspaceId, response.check);
    connectionCheckErrors.delete(workspaceId);
    renderConnectionStatuses(workspaceId);
    if (manual) {
      statusCard.hidden = false;
      statusElement.textContent = response.check.confirmed
        ? response.check.api === "VALID"
          ? "Fully verified"
          : response.check.api === "MISSING"
            ? "Console verified · API key needed"
            : "API key needs refresh"
        : "Connection needs attention";
      detailElement.textContent = response.check.message;
      statusCard.dataset.tone =
        response.check.confirmed && response.check.api === "VALID" ? "success" : "error";
      dialogFeedback.hidden = true;
    }
  } catch (error) {
    if (
      panelState.actorConsoleAccount?.userId !== actorUserId ||
      epoch !== connectionCheckEpoch ||
      revision !== (connectionCheckRevisions.get(workspaceId) ?? 0)
    )
      return;
    const message = error instanceof Error ? error.message : "Could not check the connection.";
    connectionChecks.delete(workspaceId);
    connectionCheckErrors.set(workspaceId, message);
    renderConnectionStatuses(workspaceId);
    if (manual) showError(message);
  }
}

function isUnhealthyCredential(status: string): boolean {
  return status === "EXPIRED" || status === "INVALID" || status === "ERROR";
}

async function openWorkspaceSettings(workspaceId: string) {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: OPEN_WORKSPACE_SETTINGS,
      workspaceId,
    })) as { ok: boolean; error?: string };
    if (!response.ok) throw new Error(response.error ?? "Could not open workspace settings.");
    if (connectionDialog.open) connectionDialog.close();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not open workspace settings.");
  }
}

function openApifyConsole(accountId: string | null) {
  const target = knownApifyTarget(displayedAccount().account, accountId);
  void navigateActiveTab(apifyConsoleUrl(target))
    .then((opened) => {
      if (!opened) {
        throw new Error("Select a browser tab before opening Apify Console.");
      }
    })
    .catch((error: unknown) => {
      showError(error instanceof Error ? error.message : "Could not open Apify Console.");
    });
}

async function importApiKey(workspaceId: string, apifyAccountId: string) {
  boxImportAction.disabled = true;
  dialogFeedback.hidden = true;
  try {
    const response = (await chrome.runtime.sendMessage({
      type: IMPORT_APIFY_API_KEY,
      workspaceId,
      apifyAccountId,
    })) as { ok: boolean; error?: string };
    if (!response.ok) throw new Error(response.error ?? "Could not import the API key.");
    connectionCheckRevisions.set(workspaceId, (connectionCheckRevisions.get(workspaceId) ?? 0) + 1);
    connectionChecks.delete(workspaceId);
    connectionCheckErrors.delete(workspaceId);
    connectionCheckAttempts.set(workspaceId, Date.now());
    await loadState();
    await checkWorkspaceConnection(workspaceId);
    dialogFeedback.hidden = false;
    dialogFeedback.dataset.tone = "success";
    dialogFeedback.textContent = "API key saved with this workspace’s Apify browser session.";
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not import the API key.");
  } finally {
    boxImportAction.disabled = false;
  }
}

function renderAccount() {
  const live = panelState.account;
  const account = displayedAccount().account;
  setDomainState(
    consoleStatus,
    live?.sourceOrigin === "console" ? "Observed" : live ? "Not observed" : "Not detected",
    live?.sourceOrigin === "console",
  );
  setDomainState(backendStatus, live ? "Resume succeeded" : "Not detected", Boolean(live));
  renderCookieDiagnostics();
  if (!account) {
    accountPill.textContent = "Waiting for session";
    accountPill.dataset.ready = "false";
    accountPhoto.hidden = true;
    accountPhoto.removeAttribute("src");
    accountInitial.hidden = false;
    accountInitial.textContent = "?";
    accountName.textContent = "No account detected";
    accountUsername.textContent = "Open Apify Console to sign in";
    accountDetail.textContent =
      "Reload Apify Console so the extension can observe its authentication resume request.";
    return;
  }
  const name = account.displayName || account.username || "Profile details unavailable";
  const pictureUrl = safePictureUrl(account.pictureUrl);
  accountInitial.textContent = name.charAt(0).toUpperCase();
  if (pictureUrl) {
    if (accountPhoto.src !== pictureUrl) {
      accountPhoto.hidden = true;
      accountInitial.hidden = false;
      accountPhoto.src = pictureUrl;
    }
    if (accountPhoto.complete && accountPhoto.naturalWidth > 0) {
      accountPhoto.hidden = false;
      accountInitial.hidden = true;
    }
  } else {
    accountPhoto.hidden = true;
    accountPhoto.removeAttribute("src");
    accountInitial.hidden = false;
  }
  accountPill.textContent = live ? "Session detected" : "Saved account list";
  accountPill.dataset.ready = String(Boolean(live));
  accountName.textContent = name;
  accountUsername.textContent = account.username
    ? `@${account.username}`
    : `Account ID ${account.userId}`;
  accountDetail.textContent = live
    ? account.username || account.displayName
      ? `Session seen at ${formatExpiry(account.observedAt)} · ID ${account.userId}`
      : `Session seen at ${formatExpiry(account.observedAt)}. Apify has not returned profile details for ID ${account.userId}.`
    : `Last seen ${new Date(account.observedAt).toLocaleString()} · Open Apify Console to refresh access.`;
}

function renderCookieDiagnostics() {
  const account = panelState.account;
  checkCookieButton.hidden = !account || !panelState.actorConsoleAccount;
  if (!account) {
    setDomainState(cookieStatus, "Not checked", false);
    sessionNote.textContent = "Open Apify Console and reload it to detect your session. Cookie access is checked only when you request it.";
    return;
  }
  const check = panelState.cookieCheck?.userId === account.userId ? panelState.cookieCheck : null;
  checkCookieButton.textContent = check ? "Recheck ApifyRT cookie" : "Check ApifyRT cookie";
  if (!check) {
    setDomainState(cookieStatus, "Not checked", false);
    sessionNote.textContent =
      "Apify sign-in is detected. Check the cookie to ask Chrome for temporary access. Checking does not connect a workspace.";
    return;
  }
  if (Date.now() - Date.parse(check.checkedAt) > COOKIE_CHECK_FRESH_MS) {
    setDomainState(cookieStatus, "Recheck needed", false);
    sessionNote.textContent = `The last cookie check was at ${formatExpiry(check.checkedAt)}. Recheck to see whether it is still available.`;
    return;
  }
  if (check.outcome === "DENIED") {
    setDomainState(cookieStatus, "Permission declined", false);
    sessionNote.textContent = "Chrome did not grant cookie access. Recheck when you are ready.";
    return;
  }
  if (check.outcome === "ERROR") {
    setDomainState(cookieStatus, "Check failed", false);
    sessionNote.textContent = "Chrome could not read the cookie. Recheck or reload Apify Console.";
    return;
  }
  setDomainState(
    cookieStatus,
    check.backendFound ? "Found" : check.backendExpired ? "Expired" : "Missing",
    check.backendFound,
  );
  sessionNote.textContent = `Last checked at ${formatExpiry(check.checkedAt)}: Console page ${check.consoleFound ? "found" : "not found"}; Console backend ${check.backendFound ? "found" : check.backendExpired ? "expired" : "not found"}. This checks presence; ActorConsole validates the session when connecting. The cookie value was not saved.`;
}

async function pairActorConsole() {
  if (pairActorConsoleButton.disabled) return;
  const retryingSavedConnection = panelState.pairingStored;
  pairActorConsoleButton.disabled = true;
  pairActorConsoleButton.setAttribute("aria-busy", "true");
  welcomeFeedback = {
    message: panelState.pairingStored ? "Checking your saved ActorConsole connection…" : "Opening ActorConsole sign-in…",
    error: false,
  };
  renderWelcomeState();
  try {
    if (panelState.pairingStored) {
      await loadState();
      return;
    }
    const result = (await chrome.runtime.sendMessage({ type: PAIR_BEGIN })) as {
      ok: boolean;
      error?: string;
    };
    if (!result.ok) throw new Error(result.error ?? "Could not open ActorConsole sign-in.");
    welcomeFeedback = {
      message:
        "Complete sign-in in the opened ActorConsole tab. This sidebar will update when pairing finishes.",
      error: false,
    };
    renderWelcomeState();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not start pairing.");
  } finally {
    if (retryingSavedConnection && !welcomeFeedback?.error) welcomeFeedback = null;
    pairActorConsoleButton.disabled = false;
    pairActorConsoleButton.removeAttribute("aria-busy");
    if (!panelState.actorConsoleAccount) renderWelcomeState();
  }
}

async function unpairActorConsole() {
  unpairActorConsoleButton.disabled = true;
  unpairActorConsoleButton.setAttribute("aria-busy", "true");
  welcomeUnpairButton.disabled = true;
  try {
    const result = (await chrome.runtime.sendMessage({ type: UNPAIR })) as {
      ok: boolean;
      error?: string;
    };
    if (!result.ok) throw new Error(result.error ?? "Could not disconnect the extension.");
    welcomeFeedback = null;
    await loadState();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not disconnect the extension.");
  } finally {
    unpairActorConsoleButton.disabled = false;
    unpairActorConsoleButton.removeAttribute("aria-busy");
    welcomeUnpairButton.disabled = false;
  }
}

async function openActorConsole(workspaceId: string, apifyAccountId: string) {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: OPEN_ACTORCONSOLE,
      workspaceId,
      apifyAccountId,
    })) as {
      ok: boolean;
      error?: string;
    };
    if (!response.ok) throw new Error(response.error ?? "Could not open ActorConsole.");
    if (connectionDialog.open) connectionDialog.close();
    statusCard.hidden = false;
    statusElement.textContent = "Connecting selected workspace";
    detailElement.textContent = "The connection page is opening for the workspace you selected.";
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not open ActorConsole.");
  }
}

async function refreshConnections() {
  refreshConnectionsButton.disabled = true;
  try {
    await loadState();
    const response = (await chrome.runtime.sendMessage({ type: REFRESH_CONNECTIONS })) as {
      ok: boolean;
      action?: "reloaded" | "opened";
      error?: string;
    };
    if (!response.ok) throw new Error(response.error ?? "Could not refresh Apify accounts.");
    statusCard.hidden = false;
    statusElement.textContent = "Reloading Apify accounts";
    detailElement.textContent =
      response.action === "opened"
        ? "Apify Console opened. Sign in there, then return to this sidebar."
        : "Apify Console is reloading. The account list will update when its session resumes.";
    statusCard.dataset.tone = "neutral";
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not reload Apify accounts.");
  } finally {
    refreshConnectionsButton.disabled = false;
  }
}

async function verifyAllConnections() {
  const workspaceIds = panelState.workspaces.filter(hasSavedConnection).map((item) => item.id);
  if (!workspaceIds.length || verificationProgress) return;
  verificationProgress = { checked: 0, total: workspaceIds.length };
  renderWorkspaces();
  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(2, workspaceIds.length) }, async () => {
        while (next < workspaceIds.length) {
          const workspaceId = workspaceIds[next++];
          await checkWorkspaceConnection(workspaceId, false);
          if (verificationProgress) verificationProgress.checked += 1;
          renderWorkspaces();
        }
      }),
    );
  } finally {
    verificationProgress = null;
    renderWorkspaces();
  }
}

async function createWorkspace() {
  createWorkspaceButton.disabled = true;
  try {
    if (
      connectNewWorkspace.checked &&
      workspaceCreationAccountId &&
      !(await selectTarget(workspaceCreationAccountId))
    )
      return;
    const response = (await chrome.runtime.sendMessage({
      type: CREATE_WORKSPACE,
      workspaceName: workspaceName.value.trim(),
      connectAfterCreate: connectNewWorkspace.checked,
    })) as { ok: boolean; connectedNext?: boolean; error?: string };
    if (!response.ok) throw new Error(response.error ?? "Could not create the workspace.");
    workspaceDialog.close();
    workspaceCreationAccountId = null;
    workspaceName.value = "";
    await loadState();
    statusCard.hidden = false;
    statusElement.textContent = "Workspace created";
    detailElement.textContent = response.connectedNext
      ? "Complete the Apify connection in the opened ActorConsole tab."
      : "The new workspace is available in both views. Choose an Apify account to connect it.";
    statusCard.dataset.tone = "success";
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not create the workspace.");
  } finally {
    createWorkspaceButton.disabled = false;
  }
}

async function disconnectWorkspace(workspace: ActorConsoleWorkspace) {
  disconnectDescription.textContent = `This removes the saved browser session and API key from “${workspace.name}”. The workspace itself stays in ActorConsole.`;
  disconnectDialog.returnValue = "";
  disconnectDialog.showModal();
  const confirmed = await new Promise<boolean>((resolve) => {
    disconnectDialog.addEventListener(
      "close",
      () => resolve(disconnectDialog.returnValue === "disconnect"),
      { once: true },
    );
  });
  if (!confirmed) return;
  boxDisconnectAction.disabled = true;
  try {
    const response = (await chrome.runtime.sendMessage({
      type: DISCONNECT_WORKSPACE,
      workspaceId: workspace.id,
    })) as { ok: boolean; error?: string };
    if (!response.ok) throw new Error(response.error ?? "Could not disconnect the workspace.");
    connectionCheckRevisions.set(
      workspace.id,
      (connectionCheckRevisions.get(workspace.id) ?? 0) + 1,
    );
    connectionChecks.delete(workspace.id);
    connectionCheckAttempts.delete(workspace.id);
    connectionCheckErrors.delete(workspace.id);
    await loadState();
    if (connectionDialog.open) connectionDialog.close();
    statusCard.hidden = false;
    statusElement.textContent = "Workspace disconnected";
    detailElement.textContent = `${workspace.name} no longer has a saved Apify connection.`;
    statusCard.dataset.tone = "success";
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not disconnect the workspace.");
  } finally {
    boxDisconnectAction.disabled = false;
  }
}

async function connectCookie() {
  if (!panelState.pending || !panelState.account || !panelState.actorConsoleAccount) return;
  const userId = panelState.account.userId;
  setBusy(true, "Requesting cookie access…");

  try {
    const granted = await chrome.permissions.request({ permissions: ["cookies"] });
    if (!granted) {
      await saveCookieCheck(userId, "DENIED");
      throw new Error("Cookie access was not approved.");
    }

    setBusy(true, "Checking both Apify domains…");
    const {
      consoleCookies,
      backendCookies,
      nowSeconds,
      consoleFound,
      backendFound,
      backendExpired,
    } = await readApifyRtCookies();
    await saveCookieCheck(userId, "CHECKED", consoleFound, backendFound, backendExpired);

    const selected = selectApifyRtCookie(backendCookies, consoleCookies, nowSeconds);
    if (!selected.ok) throw new Error(selected.message);

    let apifyRt = selected.value;
    try {
      setBusy(true, "Sending to ActorConsole…");
      const response = (await chrome.runtime.sendMessage({
        type: DELIVER_COOKIE,
        apifyRt,
        expectedApifyUserId: userId,
      })) as {
        ok: boolean;
        error?: string;
      };
      if (!response.ok)
        throw new Error(response.error ?? "ActorConsole did not accept the connection.");
      statusElement.textContent = "Validating session";
      detailElement.textContent =
        "ActorConsole is validating the Apify session for your selected workspace.";
      connectButton.hidden = true;
      consentElement.hidden = true;
    } finally {
      apifyRt = "";
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not connect the Apify session.");
  } finally {
    await chrome.permissions.remove({ permissions: ["cookies"] }).catch(() => false);
    connectButton.disabled = false;
  }
}

async function checkApifyRtCookie() {
  if (!panelState.account || !panelState.actorConsoleAccount) return;
  const userId = panelState.account.userId;
  checkCookieButton.disabled = true;
  try {
    const granted = await chrome.permissions.request({ permissions: ["cookies"] });
    if (!granted) {
      await saveCookieCheck(userId, "DENIED");
      return;
    }
    const { consoleFound, backendFound, backendExpired } = await readApifyRtCookies();
    await saveCookieCheck(userId, "CHECKED", consoleFound, backendFound, backendExpired);
  } catch {
    await saveCookieCheck(userId, "ERROR");
  } finally {
    await chrome.permissions.remove({ permissions: ["cookies"] }).catch(() => false);
    checkCookieButton.disabled = false;
  }
}

async function readApifyRtCookies() {
  const [consoleCookies, backendCookies] = await Promise.all([
    chrome.cookies.getAll({ url: "https://console.apify.com/", name: "ApifyRT" }),
    chrome.cookies.getAll({ url: "https://console-backend.apify.com/", name: "ApifyRT" }),
  ]);
  const nowSeconds = Date.now() / 1_000;
  const backendFound = backendCookies.some((cookie) => isLive(cookie, nowSeconds));
  return {
    consoleCookies,
    backendCookies,
    nowSeconds,
    consoleFound: consoleCookies.some((cookie) => isLive(cookie, nowSeconds)),
    backendFound,
    backendExpired:
      !backendFound &&
      backendCookies.some(
        (cookie) =>
          Boolean(cookie.value) &&
          cookie.expirationDate !== undefined &&
          cookie.expirationDate <= nowSeconds,
      ),
  };
}

async function saveCookieCheck(
  userId: string,
  outcome: CookieCheck["outcome"],
  consoleFound = false,
  backendFound = false,
  backendExpired = false,
) {
  const cookieCheck: CookieCheck = {
    userId,
    checkedAt: new Date().toISOString(),
    outcome,
    consoleFound,
    backendFound,
    backendExpired,
  };
  panelState.cookieCheck = cookieCheck;
  renderCookieDiagnostics();
  await chrome.storage.session
    .set({ [COOKIE_CHECK_STORAGE_KEY]: cookieCheck })
    .catch(() => undefined);
}

function parseCookieCheck(value: unknown): CookieCheck | null {
  if (!value || typeof value !== "object") return null;
  const check = value as Partial<CookieCheck>;
  return typeof check.userId === "string" &&
    /^[A-Za-z0-9]{8,64}$/.test(check.userId) &&
    typeof check.checkedAt === "string" &&
    Number.isFinite(Date.parse(check.checkedAt)) &&
    (check.outcome === "CHECKED" || check.outcome === "DENIED" || check.outcome === "ERROR") &&
    typeof check.consoleFound === "boolean" &&
    typeof check.backendFound === "boolean" &&
    typeof check.backendExpired === "boolean"
    ? (check as CookieCheck)
    : null;
}

function isLive(cookie: chrome.cookies.Cookie, nowSeconds: number): boolean {
  return (
    Boolean(cookie.value) &&
    (cookie.expirationDate === undefined || cookie.expirationDate > nowSeconds)
  );
}

function setDomainState(element: HTMLElement, label: string, ready: boolean) {
  element.textContent = label;
  element.dataset.ready = String(ready);
}

function safePictureUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function setBusy(busy: boolean, label: string) {
  statusCard.hidden = false;
  connectButton.disabled = busy;
  statusElement.textContent = label;
  statusCard.dataset.tone = "neutral";
}

function showError(message: string) {
  statusCard.hidden = false;
  if (!panelState.actorConsoleAccount) {
    welcomeFeedback = { message, error: true };
    renderWelcomeState();
    return;
  }
  statusElement.textContent = "Connection needs attention";
  detailElement.textContent = message;
  statusCard.hidden = false;
  statusCard.dataset.tone = "error";
  if (connectionDialog.open) {
    dialogFeedback.hidden = false;
    dialogFeedback.dataset.tone = "error";
    dialogFeedback.textContent = message;
  }
  const selected = panelState.account ? selectedApifyTarget(panelState.account) : null;
  const requested =
    panelState.pending?.account ??
    (panelState.account ? { id: panelState.account.userId, type: "PERSONAL" as const } : null);
  connectButton.hidden =
    !panelState.pending ||
    !panelState.actorConsoleAccount ||
    !selected ||
    !requested ||
    selected.id !== requested.id ||
    selected.type !== requested.type;
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date)
    : "the request expires";
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing side panel element: ${id}`);
  return element;
}

function requiredButton(id: string): HTMLButtonElement {
  return requiredElement(id) as HTMLButtonElement;
}
