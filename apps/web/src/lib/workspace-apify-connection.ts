export interface WorkspaceApifyConnection {
  connected: boolean;
  apiKeyConfigured?: boolean;
  apiOperationsAvailable?: boolean;
  apiTokenStatus?: string;
  uiTokenConfigured?: boolean;
  cookiesConfigured?: boolean;
  consoleOperationsAvailable?: boolean;
}

export type ApifyConnectionRequirement = "api" | "console";
export type WorkspaceApifySetupReason =
  "connect" | "api-key" | "repair-api" | "console" | "unavailable";

export function workspaceApifySetupReason(
  status: WorkspaceApifyConnection | null,
  requirement: ApifyConnectionRequirement = "api",
): WorkspaceApifySetupReason | null {
  if (!status) return "unavailable";
  if (!status.connected) return "connect";
  if (!status.apiKeyConfigured) return "api-key";
  if (
    status.apiOperationsAvailable === false ||
    /^(invalid|expired|error|failed)$/i.test(status.apiTokenStatus ?? "")
  )
    return "repair-api";
  if (
    requirement === "console" &&
    ((!status.uiTokenConfigured && !status.cookiesConfigured) ||
      status.consoleOperationsAvailable === false)
  )
    return "console";
  return null;
}
