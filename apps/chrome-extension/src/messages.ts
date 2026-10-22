export const WEB_SOURCE = "actorconsole-web";
export const EXTENSION_SOURCE = "actorconsole-extension";

export const HANDOFF_START = "ACTORCONSOLE_APIFY_HANDOFF_START";
export const HANDOFF_COOKIE = "ACTORCONSOLE_APIFY_HANDOFF_COOKIE";
export const HANDOFF_RESULT = "ACTORCONSOLE_APIFY_HANDOFF_RESULT";
export const HANDOFF_REGISTERED = "ACTORCONSOLE_APIFY_HANDOFF_REGISTERED";
export const EXTENSION_READY = "ACTORCONSOLE_APIFY_EXTENSION_READY";
export const EXTENSION_PING = "ACTORCONSOLE_APIFY_EXTENSION_PING";

export const REGISTER_HANDOFF = "REGISTER_HANDOFF";
export const DELIVER_COOKIE = "DELIVER_COOKIE";
export const GET_STATE = "GET_STATE";
export const REFRESH_CONNECTIONS = "REFRESH_CONNECTIONS";
export const OPEN_ACTORCONSOLE = "OPEN_ACTORCONSOLE";
export const OPEN_WORKSPACE_SETTINGS = "OPEN_WORKSPACE_SETTINGS";
export const IMPORT_APIFY_API_KEY = "IMPORT_APIFY_API_KEY";
export const CREATE_WORKSPACE = "CREATE_WORKSPACE";
export const DISCONNECT_WORKSPACE = "DISCONNECT_WORKSPACE";
export const CHECK_WORKSPACE_CONNECTION = "CHECK_WORKSPACE_CONNECTION";
export const SELECT_APIFY_ACCOUNT = "SELECT_APIFY_ACCOUNT";
export const PAIR_BEGIN = "PAIR_BEGIN";
export const PAIR_COMPLETE = "PAIR_COMPLETE";
export const PAIR_CHANGED = "PAIR_CHANGED";
export const PAIR_RESULT = "PAIR_RESULT";
export const UNPAIR = "UNPAIR";
export const APIFY_RESUME_SOURCE = "actorconsole-apify-resume";
export const APIFY_SESSION_DETECTED = "APIFY_SESSION_DETECTED";
export const APIFY_SESSION_CLEARED = "APIFY_SESSION_CLEARED";

export const ACTORCONSOLE_ORIGIN =
  process.env.ACTORCONSOLE_EXTENSION_WEB_ORIGIN || "http://localhost:8080";
export const ACTORCONSOLE_CONNECT_URL = `${ACTORCONSOLE_ORIGIN}/dashboard/apify?extension=connect`;
// The website is static; device operations run on the Node.js API host.
export const ACTORCONSOLE_DEVICE_API =
  `${process.env.ACTORCONSOLE_EXTENSION_API_ORIGIN || "http://localhost:4000"}/extension-device`;

export function apifyConsoleUrl(account: { id: string; type: "PERSONAL" | "ORGANIZATION" } | null) {
  return account?.type === "ORGANIZATION"
    ? `https://console.apify.com/organization/${encodeURIComponent(account.id)}`
    : "https://console.apify.com/";
}

export type ActorConsoleAccount = {
  userId: string;
  name: string | null;
  username: string | null;
  email: string;
  image: string | null;
  expiresAt: string;
};

export type ActorConsoleWorkspace = {
  id: string;
  name: string;
  isDefault: boolean;
  connection: "MATCHED" | "AVAILABLE" | "OTHER_ACCOUNT" | "UNKNOWN_ACCOUNT";
  apifyUsername: string | null;
  connectedAccountId: string | null;
  apiKeyConfigured: boolean;
  apiTokenStatus: string;
  uiTokenConfigured: boolean;
  uiTokenStatus: string;
  browserSessionConfigured: boolean;
  browserSessionStatus: string;
  lastValidatedAt: string | null;
};

export type WorkspaceConnectionCheck = {
  checkedAt: string;
  confirmed: boolean;
  api: "VALID" | "ERROR" | "MISSING";
  console: "VALID" | "ERROR" | "MISSING";
  accountAccess: "VALID" | "INVALID" | "ERROR" | "UNIDENTIFIED" | "UNVERIFIED";
  message: string;
};

export type ExtensionHandoff = {
  handoffId: string;
  challenge: string;
  expiresAt: string;
  workspace: { id: string; name: string };
  account: { id: string; type: "PERSONAL" | "ORGANIZATION" } | null;
};

export type ApifyOrganization = {
  id: string;
  name: string;
  username: string | null;
  pictureUrl: string | null;
};

export type HandoffResult = {
  handoffId: string;
  ok: boolean;
  message: string;
};

export type DetectedApifyAccount = {
  userId: string;
  username: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  observedAt: string;
  sourceOrigin: "console" | "backend";
  viewedUserId: string | null;
  selectedAccountId: string;
  selectionManual: boolean;
  organizations: ApifyOrganization[];
  organizationsStatus: "loading" | "ready" | "limited" | "unavailable";
};

// Display metadata only. This is safe to keep after the browser session ends;
// it must never be used to authorize a connection or an API key import.
export type CachedApifyAccount = Pick<DetectedApifyAccount,
  "userId" | "username" | "displayName" | "pictureUrl" | "observedAt" |
  "selectedAccountId" | "organizations"
> & { cachedAt: string };

export type DisplayApifyAccount = DetectedApifyAccount | CachedApifyAccount;

export function isExtensionHandoff(value: unknown): value is ExtensionHandoff {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ExtensionHandoff>;
  return (
    typeof candidate.handoffId === "string" &&
    candidate.handoffId.length > 0 &&
    typeof candidate.challenge === "string" &&
    candidate.challenge.length >= 32 &&
    typeof candidate.expiresAt === "string" &&
    Number.isFinite(new Date(candidate.expiresAt).getTime()) &&
    Boolean(candidate.workspace) &&
    typeof candidate.workspace?.id === "string" &&
    typeof candidate.workspace?.name === "string"
    && (candidate.account == null || (
      typeof candidate.account?.id === "string" &&
      /^[A-Za-z0-9]{8,64}$/.test(candidate.account.id) &&
      (candidate.account.type === "PERSONAL" || candidate.account.type === "ORGANIZATION")
    ))
  );
}
