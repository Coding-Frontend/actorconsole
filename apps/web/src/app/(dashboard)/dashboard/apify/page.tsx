import { authenticatedServerFetch } from "@/lib/server-api";
import { ApifyConnect } from "@/components/dashboard/apify-connect";
import { ApifyWorkspaceSettingsSelection } from "@/components/dashboard/apify-workspace-settings-selection";
import { ApifyOperationsSummaryLoader } from "@/components/dashboard/apify-operations-summary";
import { ApifyBackgroundRefresh } from "@/components/dashboard/apify-background-refresh";
import { ApifyConnectionGuide } from "@/components/dashboard/apify-connection-guide";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { PlugZap, ShieldCheck } from "lucide-react";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";

export default async function ApifyConnectionPage() {
  const response = await authenticatedServerFetch("/apify/status");
  if (!response.ok) throw new Error("Could not load the Apify connection");
  const status = (await response.json()).data as {
    connected: boolean;
    apifyUserId?: string;
    accountType?: "PERSONAL" | "ORGANIZATION" | null;
    username?: string | null;
    uiTokenConfigured?: boolean;
    cookiesConfigured?: boolean;
    apiKeyConfigured?: boolean;
    apiTokenStatus?: string;
    uiTokenStatus?: string;
    cookiesStatus?: string;
    validatedAt?: string | null;
    validationError?: string | null;
    apiOperationsAvailable?: boolean;
    consoleOperationsAvailable?: boolean;
    actorPublishingAvailable?: boolean;
    activeConsoleCredential?: "uiToken" | "cookies" | null;
    credentialMode?: "FULL" | "API_ONLY" | "PUBLISHING_ONLY" | "LIMITED";
    extensionEnabled?: boolean;
  };
  const publishingConfigured = status.uiTokenConfigured || status.cookiesConfigured;
  const activeConsoleCredential =
    status.activeConsoleCredential ??
    (status.uiTokenConfigured ? "uiToken" : status.cookiesConfigured ? "cookies" : null);
  const publishingStatus =
    activeConsoleCredential === "uiToken" ? status.uiTokenStatus : status.cookiesStatus;
  const hasIssue =
    (status.apiKeyConfigured && isUnhealthyStatus(status.apiTokenStatus)) ||
    (publishingConfigured && isUnhealthyStatus(publishingStatus));
  const connectionLabel = hasIssue
    ? "Needs attention"
    : status.credentialMode === "FULL"
      ? "Fully connected"
      : status.credentialMode === "API_ONLY"
        ? "API operations only"
        : status.credentialMode === "PUBLISHING_ONLY"
          ? "Console only"
          : "Not configured";

  return (
    <div className="space-y-6">
      <ApifyWorkspaceSettingsSelection />
      <ApifyBackgroundRefresh
        apifyUserId={status.apifyUserId}
        validatedAt={status.validatedAt}
        enabled={Boolean(
          status.apiKeyConfigured || status.uiTokenConfigured || status.cookiesConfigured,
        )}
      />
      <DashboardPageHeader
        context="Developer connection"
        title="Apify connection"
        description="Connect this workspace to synchronize Actors, run workflows, and manage Store metadata. An API key is required for actual Actor publication; Console credentials add metadata and category operations."
        breadcrumbs={[{ label: "Developer" }, { label: "Apify connection" }]}
        status={
          <Badge
            variant="outline"
            className={
              hasIssue
                ? "border-destructive/40 text-destructive"
                : status.connected
                  ? "border-signal-green/40 text-signal-green"
                  : "border-signal-orange/40 text-signal-orange"
            }
          >
            {connectionLabel}
          </Badge>
        }
      />
      <Panel variant="default" radius="panel" className="p-0">
        <div className="border-border/80 flex flex-col gap-4 border-b px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="flex items-start gap-3">
            <span className="border-border bg-muted/25 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border">
              <PlugZap className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display-tight text-xl">Workspace credentials</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Manage this workspace&apos;s Apify access.
              </p>
            </div>
          </div>
          <ApifyConnectionGuide />
        </div>
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <ApifyConnect initialStatus={status} />
        </div>
        <div className="border-border/80 text-muted-foreground flex items-start gap-2 border-t px-5 py-4 text-xs leading-5 sm:px-6">
          <ShieldCheck className="text-signal-green mt-0.5 h-4 w-4 shrink-0" />
          Saved credentials are encrypted for this workspace. Values are hidden after saving.
        </div>
      </Panel>

      <ApifyOperationsSummaryLoader />
    </div>
  );
}

function isUnhealthyStatus(status?: string): boolean {
  return status === "EXPIRED" || status === "INVALID" || status === "ERROR";
}
