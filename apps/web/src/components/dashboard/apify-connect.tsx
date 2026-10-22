"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChromeExtensionLink } from "@/components/chrome-extension-link";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Monitor,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "@/components/dashboard/dashboard-navigation";
import { WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
import {
  ApifyExtensionConnect,
  type ApifyExtensionConnectionResult,
} from "@/components/dashboard/apify-extension-connect";

interface Props {
  initialStatus: {
    connected: boolean;
    apiKeyConfigured?: boolean;
    apifyUserId?: string;
    username?: string | null;
    accountType?: "PERSONAL" | "ORGANIZATION" | null;
    uiTokenConfigured?: boolean;
    cookiesConfigured?: boolean;
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
  onConnected?: () => void | Promise<void>;
  submitLabel?: string;
  showDisconnect?: boolean;
}

const API_BASE = API_BASE_URL;
type ApifyRtCandidate = { value: string; domain?: string };

function findApifyRtCookie(value: unknown): ApifyRtCandidate | null {
  if (typeof value === "string") {
    const match = value.match(/(?:^|[^A-Za-z0-9_-])ApifyRT\s*=\s*["']?([^;,\s'"}]+)/i);
    return match?.[1] ? { value: match[1] } : null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = findApifyRtCookie(entry);
      if (candidate) return candidate;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (
    typeof record.name === "string" &&
    record.name.toLowerCase() === "apifyrt" &&
    typeof record.value === "string" &&
    record.value.trim()
  ) {
    return {
      value: record.value.trim(),
      domain: typeof record.domain === "string" ? record.domain : undefined,
    };
  }
  for (const [name, cookieValue] of Object.entries(record)) {
    if (name.toLowerCase() === "apifyrt" && typeof cookieValue === "string" && cookieValue.trim()) {
      return { value: cookieValue.trim() };
    }
  }
  for (const nested of Object.values(record)) {
    const candidate = findApifyRtCookie(nested);
    if (candidate) return candidate;
  }
  return null;
}

function parseCookieJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function sanitizeResumeCookieInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    /\bcurl\b/i.test(trimmed) &&
    !/https:\/\/console-backend\.apify\.com\/public\/authentication\/resume(?:['"?\s]|$)/i.test(
      trimmed,
    )
  ) {
    return null;
  }
  const candidate = findApifyRtCookie(parseCookieJson(trimmed) ?? trimmed);
  return candidate?.value ? `ApifyRT=${candidate.value}` : null;
}

function sanitizeDomainCookieInput(backendValue: string): string | null {
  const candidate = findApifyRtCookie(parseCookieJson(backendValue) ?? backendValue);
  if (!candidate?.value) return null;
  if (
    candidate.domain &&
    !candidate.domain.trim().replace(/^\./, "").toLowerCase().endsWith("console-backend.apify.com")
  ) {
    return null;
  }
  return JSON.stringify([
    { name: "ApifyRT", value: candidate.value, domain: "console-backend.apify.com" },
  ]);
}

export function ApifyConnect({
  initialStatus,
  onConnected,
  submitLabel,
  showDisconnect = true,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [token, setToken] = useState("");
  const [cookieInputMode, setCookieInputMode] = useState<"domains" | "resumeCurl">("resumeCurl");
  const [publishingCredential, setPublishingCredential] = useState("");
  const [consoleCookies, setConsoleCookies] = useState("");
  const [consoleBackendCookies, setConsoleBackendCookies] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showPublishingCredential, setShowPublishingCredential] = useState(false);
  const [editingCredential, setEditingCredential] = useState<"api" | "publishing" | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const apiInput = token.trim();
  const publishingInput = publishingCredential.trim();
  const consoleCookieInput = consoleCookies.trim();
  const consoleBackendCookieInput = consoleBackendCookies.trim();
  const cookieInput =
    cookieInputMode === "resumeCurl"
      ? sanitizeResumeCookieInput(publishingInput)
      : sanitizeDomainCookieInput(consoleBackendCookieInput);
  const hasPublishingInput =
    cookieInputMode === "resumeCurl"
      ? Boolean(publishingInput)
      : Boolean(consoleCookieInput || consoleBackendCookieInput);
  const apiInputValid = apiInput.length >= 20;
  const publishingInputValid = Boolean(cookieInput);
  const hasCredentialInput = Boolean(apiInput || hasPublishingInput);
  const connectionReady = apiInputValid || publishingInputValid;
  const credentialInputInvalid =
    (Boolean(apiInput) && !apiInputValid) || (hasPublishingInput && !publishingInputValid);

  async function connect() {
    const apiKey = token.trim();
    const hasValidApiKey = apiKey.length >= 20;
    const hasValidCookies = publishingInputValid;
    if (!hasValidApiKey && !hasValidCookies) return;
    startTransition(async () => {
      try {
        const res = await fetch(`${API_BASE}/apify/connect`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ...(hasValidApiKey ? { token: apiKey } : {}),
            ...(hasValidCookies && cookieInput ? { cookies: cookieInput } : {}),
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        setStatus((current) => ({
          ...current,
          connected: true,
          apiKeyConfigured: body.data.apiKeyConfigured,
          apifyUserId: body.data.apifyUserId,
          accountType: body.data.accountType ?? null,
          username: body.data.apifyUsername ?? status.username,
          uiTokenConfigured: body.data.uiTokenConfigured,
          cookiesConfigured: body.data.cookiesConfigured,
          apiTokenStatus: body.data.apiTokenStatus,
          uiTokenStatus: body.data.uiTokenStatus,
          cookiesStatus: body.data.cookiesStatus,
          validatedAt: new Date().toISOString(),
          validationError: null,
          credentialMode: body.data.credentialMode,
        }));
        setToken("");
        setPublishingCredential("");
        setConsoleCookies("");
        setConsoleBackendCookies("");
        setEditingCredential(null);
        window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
        if (hasValidApiKey) {
          const syncResponse = await fetch(`${API_BASE}/actors/sync`, {
            method: "POST",
            credentials: "include",
          });
          const syncBody = await syncResponse.json().catch(() => null);
          if (syncResponse.ok && syncBody?.ok) {
            window.dispatchEvent(new Event(WORKSPACE_DATA_REFRESHED_EVENT));
            const synced = syncBody.data?.synced ?? 0;
            const skipped = syncBody.data?.skipped ?? 0;
            toast.success(
              skipped > 0
                ? `Apify connected. Synced ${synced} actor${synced === 1 ? "" : "s"}; ${skipped} more require Pro. Free allows up to 50 actors and 500 monthly users.`
                : `Apify connected and ${synced} actor${synced === 1 ? "" : "s"} synced`,
            );
            if (syncBody.data?.usage?.upgradeRequired) {
              toast.warning("This workspace exceeds the Free plan. Upgrade to Pro in Billing.");
            }
          } else {
            toast.warning(
              syncBody?.error?.message ??
                "Apify connected, but the initial Actor sync needs to be retried.",
            );
          }
        } else {
          toast.success(
            "Console credential connected. Add an Apify API key to publish Actors and run schedules.",
          );
        }
        await onConnected?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to connect");
      }
    });
  }

  async function handleExtensionConnected(result: ApifyExtensionConnectionResult) {
    setStatus((current) => ({
      ...current,
      connected: true,
      apiKeyConfigured: result.apiKeyConfigured,
      apifyUserId: result.apifyUserId ?? current.apifyUserId,
      username: result.apifyUsername ?? current.username,
      accountType: result.accountType ?? current.accountType,
      uiTokenConfigured: result.uiTokenConfigured,
      cookiesConfigured: result.cookiesConfigured,
      apiTokenStatus: result.apiTokenStatus,
      uiTokenStatus: result.uiTokenStatus,
      cookiesStatus: result.cookiesStatus,
      credentialMode: result.credentialMode,
      validationError: null,
      validatedAt: new Date().toISOString(),
    }));
    setEditingCredential(null);
    window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
    toast.success(
      result.apiKeyConfigured
        ? "Apify Console access connected with the Chrome extension"
        : "Apify Console connected. Add an API key to load Actors and use API operations.",
    );
    await onConnected?.();
    router.refresh();
  }

  async function checkConnection() {
    startTransition(async () => {
      try {
        const res = await fetch(`${API_BASE}/apify/status?validate=true`, {
          cache: "no-store",
          credentials: "include",
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok || !body.data) {
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        setStatus(body.data);
        window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
        toast.success("Apify connection checked");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not check Apify connection");
      }
    });
  }

  async function disconnect() {
    const res = await fetch(`${API_BASE}/apify/disconnect`, {
      method: "DELETE",
      credentials: "include",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    }
    setStatus((current) => ({
      ...current,
      connected: false,
      apiKeyConfigured: false,
      uiTokenConfigured: false,
      cookiesConfigured: false,
      validatedAt: new Date().toISOString(),
    }));
    window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
    toast.success("Apify disconnected");
    router.refresh();
  }

  function openDisconnectConfirmation() {
    if (!pending) {
      setDisconnectOpen(true);
    }
  }

  function closeDisconnectConfirmation(open: boolean) {
    if (!pending) {
      setDisconnectOpen(open);
    }
  }

  function credentialModeDescription() {
    switch (status.credentialMode) {
      case "FULL":
        return "API key + Console credential";
      case "API_ONLY":
        return "API operations only";
      case "PUBLISHING_ONLY":
        return "Console-only access; API key required for Actor publishing";
      default:
        return "Limited connection";
    }
  }

  function credentialModeLabel() {
    switch (status.credentialMode) {
      case "FULL":
        return "API + publishing";
      case "API_ONLY":
        return "API operations only";
      case "PUBLISHING_ONLY":
        return "Console only";
      default:
        return "Limited";
    }
  }

  function validatedAtLabel() {
    return status.validatedAt ? formatValidationTime(status.validatedAt) : "Not checked yet";
  }

  function renderDisconnectDialog() {
    return (
      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={closeDisconnectConfirmation}
        title="Disconnect all Apify credentials?"
        description="This removes the saved API key and optional Console credential from this workspace. It does not delete Actors or other resources in Apify, but Actor operations and publication will stop until you reconnect."
        confirmLabel="Disconnect credentials"
        destructive
        onConfirm={disconnect}
      />
    );
  }

  function renderConnectionHealth() {
    return (
      <div className="border-border/80 flex flex-col gap-3 border-b py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Connection check</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Last validated: {validatedAtLabel()} · API and Console checked separately
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={checkConnection}
          disabled={pending}
          className="w-fit shrink-0"
        >
          <RefreshCw className={pending ? "animate-spin" : ""} />
          {pending ? "Checking…" : "Check connection now"}
        </Button>
      </div>
    );
  }

  function renderValidationError() {
    if (!status.validationError) return null;
    return (
      <div
        className="border-destructive/35 bg-destructive/[0.045] flex items-start gap-2 border p-3 text-sm"
        role="alert"
      >
        <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Connection validation details</p>
          <p className="text-muted-foreground mt-1">{status.validationError}</p>
        </div>
      </div>
    );
  }

  function renderCredentialMode() {
    return (
      <Badge variant="outline" title={credentialModeDescription()}>
        {credentialModeLabel()}
      </Badge>
    );
  }

  function renderConnectedDetails() {
    return (
      <>
        {renderValidationError()}
        {renderConnectionHealth()}
      </>
    );
  }

  function renderConnectedActions() {
    return (
      <>
        {showDisconnect && (
          <div className="border-border flex justify-end border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={openDisconnectConfirmation}
              disabled={pending}
              className="text-destructive"
            >
              <Unplug className="h-4 w-4" />
              Disconnect all Apify credentials
            </Button>
          </div>
        )}
        {renderDisconnectDialog()}
      </>
    );
  }

  const publishingConfigured = status.uiTokenConfigured || status.cookiesConfigured;
  const activeConsoleCredential =
    status.activeConsoleCredential ??
    (status.uiTokenConfigured ? "uiToken" : status.cookiesConfigured ? "cookies" : null);
  const publishingStatus =
    activeConsoleCredential === "uiToken" ? status.uiTokenStatus : status.cookiesStatus;
  const apiUnhealthy = status.apiKeyConfigured && isUnhealthyStatus(status.apiTokenStatus);
  const publishingUnhealthy = publishingConfigured && isUnhealthyStatus(publishingStatus);

  function editApiCredential() {
    setToken("");
    setEditingCredential("api");
  }

  function editPublishingCredential() {
    setPublishingCredential("");
    setConsoleCookies("");
    setConsoleBackendCookies("");
    setEditingCredential("publishing");
  }

  if (status.connected && !editingCredential) {
    return (
      <div>
        <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="border-border bg-muted/25 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border">
              {apiUnhealthy || publishingUnhealthy ? (
                <AlertTriangle className="text-destructive h-5 w-5" />
              ) : (
                <CheckCircle2 className="text-signal-green h-5 w-5" />
              )}
            </span>
            <div>
              <p className="font-medium leading-5">
                {apiUnhealthy || publishingUnhealthy
                  ? "Apify connection needs attention"
                  : status.apiKeyConfigured && publishingConfigured
                    ? "Apify is connected"
                    : publishingConfigured
                      ? "Console connected · API key needed"
                      : "API key connected"}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {status.username
                  ? `@${status.username}`
                  : status.apifyUserId
                    ? `Account ${status.apifyUserId}`
                    : "Apify account"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {status.accountType ? (
                  <Badge variant="outline">
                    {status.accountType === "ORGANIZATION" ? "Organization" : "Personal"}
                  </Badge>
                ) : null}
                {renderCredentialMode()}
              </div>
            </div>
          </div>
          {status.apifyUserId ? (
            <span className="data-stamp text-muted-foreground break-all sm:text-right">
              ID {status.apifyUserId}
            </span>
          ) : null}
        </div>

        {renderConnectedDetails()}

        <div>
          <CredentialSummary
            icon={KeyRound}
            title="API operations"
            detail={
              status.apiKeyConfigured
                ? "Actor sync, builds, runs, analytics, and publication."
                : "Add an API key from the Actor-owning Apify account to sync, run, and publish Actors."
            }
            configured={status.apiKeyConfigured}
            validationStatus={status.apiTokenStatus}
            actionLabel={status.apiKeyConfigured ? "Replace API key" : "Add API key"}
            onAction={editApiCredential}
            pending={pending}
          />
          <CredentialSummary
            icon={Monitor}
            title="Console operations"
            detail={
              activeConsoleCredential === "uiToken"
                ? "Legacy Console credential. Switch to your Apify browser session."
                : activeConsoleCredential === "cookies"
                  ? "Browser session for Console metadata, pictures, and category feedback."
                  : "Connect your browser session for Console metadata and category feedback."
            }
            configured={publishingConfigured}
            validationStatus={publishingStatus}
            actionLabel={
              status.cookiesConfigured
                ? "Replace cookies"
                : status.uiTokenConfigured
                  ? "Switch to browser session"
                  : "Connect Console session"
            }
            onAction={editPublishingCredential}
            pending={pending}
          />
        </div>

        {status.extensionEnabled ? (
          <div className="border-border border-t py-5">
            <ApifyExtensionConnect
              enabled
              apiKeyConfigured={status.apiKeyConfigured}
              sessionConfigured={Boolean(publishingConfigured)}
              onConnected={handleExtensionConnected}
              compact
            />
          </div>
        ) : null}
        {renderConnectedActions()}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {status.connected && (
        <p className="text-muted-foreground text-sm">
          {editingCredential === "api"
            ? "Replace only the API key. Your Console credential will remain unchanged."
            : "Replace only the Console credential. Your API key will remain unchanged."}
        </p>
      )}
      <p className="text-muted-foreground text-sm">
        Add an Apify API key for Actor operations and actual publication. Connect your Apify browser
        session for Console metadata, category feedback, pictures, and read operations.
      </p>
      {(!status.connected || editingCredential === "api") && (
        <div className="order-2 space-y-2">
          <Label htmlFor="apify-token">
            Apify API key <span className="text-muted-foreground">(required for publishing)</span>
          </Label>
          <div className="relative">
            <Input
              id="apify-token"
              type={showToken ? "text" : "password"}
              placeholder="apify_api_xxxxxxxxxxxx"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken((visible) => !visible)}
              className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
              aria-label={showToken ? "Hide API key" : "Show API key"}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
      {(!status.connected || editingCredential === "publishing") && (
        <div className="border-border order-1 space-y-3 rounded-md border p-4">
          <div>
            <p className="text-sm font-medium">Connect your Apify Console session</p>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              Choose an account with the Chrome extension. Console access adds metadata and
              pictures; an API key enables Actor operations.
            </p>
          </div>
          <ChromeExtensionLink />
          <ApifyExtensionConnect
            enabled={Boolean(status.extensionEnabled)}
            apiKeyConfigured={status.apiKeyConfigured}
            onConnected={handleExtensionConnected}
          />
          <details className="border-border border-t pt-3" open={!status.extensionEnabled}>
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-semibold">
              Connect manually with a resume cURL or cookie export
            </summary>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  Paste exported cookies or a copied cURL for the Console Backend authentication
                  resume request.
                </p>
              </div>
              <div className="border-border bg-background inline-flex w-fit border p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={cookieInputMode === "resumeCurl" ? "default" : "ghost"}
                  onClick={() => setCookieInputMode("resumeCurl")}
                >
                  Resume cURL
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={cookieInputMode === "domains" ? "default" : "ghost"}
                  onClick={() => setCookieInputMode("domains")}
                >
                  Domain exports
                </Button>
              </div>
              {cookieInputMode === "resumeCurl" ? (
                <div className="relative">
                  <Textarea
                    id="apify-resume-curl"
                    placeholder="Paste the copied /public/authentication/resume cURL"
                    value={publishingCredential}
                    onChange={(event) => setPublishingCredential(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className={
                      "min-h-36 pr-10 font-mono text-xs " +
                      (showPublishingCredential ? "" : "[-webkit-text-security:disc]")
                    }
                  />
                  <SecretToggle
                    visible={showPublishingCredential}
                    onToggle={() => setShowPublishingCredential((visible) => !visible)}
                    topAligned
                  />
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="console-apify-cookies">console.apify.com export</Label>
                    <Textarea
                      id="console-apify-cookies"
                      placeholder="Paste Cookie header or JSON export"
                      value={consoleCookies}
                      onChange={(event) => setConsoleCookies(event.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      className={
                        "min-h-28 font-mono text-xs " +
                        (showPublishingCredential ? "" : "[-webkit-text-security:disc]")
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="console-backend-apify-cookies">
                      console-backend.apify.com export
                    </Label>
                    <Textarea
                      id="console-backend-apify-cookies"
                      placeholder="Paste the export containing ApifyRT"
                      value={consoleBackendCookies}
                      onChange={(event) => setConsoleBackendCookies(event.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      className={
                        "min-h-28 font-mono text-xs " +
                        (showPublishingCredential ? "" : "[-webkit-text-security:disc]")
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-fit"
                    onClick={() => setShowPublishingCredential((visible) => !visible)}
                  >
                    {showPublishingCredential ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    {showPublishingCredential ? "Hide cookie values" : "Show cookie values"}
                  </Button>
                </div>
              )}
              <div className="border-border bg-muted/30 space-y-1.5 border p-3 text-xs leading-5">
                <p>
                  Export cookies from both <span className="font-mono">console.apify.com</span> and{" "}
                  <span className="font-mono">console-backend.apify.com</span>. The{" "}
                  <span className="font-mono">ApifyRT</span> cookie belongs to{" "}
                  <span className="font-mono">console-backend.apify.com</span>.
                </p>
                <p className="text-muted-foreground">
                  Alternatively, copy the cURL for{" "}
                  <span className="break-all font-mono">
                    https://console-backend.apify.com/public/authentication/resume
                  </span>
                  . This browser reduces the input to the <span className="font-mono">ApifyRT</span>
                  cookie before submission; the server validates and encrypts only that cookie.
                </p>
              </div>
            </div>
          </details>
        </div>
      )}
      {hasCredentialInput && !connectionReady ? (
        <p className="text-destructive order-3 text-xs">
          {hasPublishingInput && !publishingInputValid
            ? "The cookie export or request cURL is incomplete."
            : "The Apify API key is incomplete."}
        </p>
      ) : null}
      <div className="order-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {status.connected && (
          <Button variant="ghost" onClick={() => setEditingCredential(null)} disabled={pending}>
            Cancel
          </Button>
        )}
        <a
          href="https://console.apify.com/settings/integrations"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          Open Apify Settings → API &amp; Integrations
          <ExternalLink className="h-3 w-3" />
        </a>
        <Button
          onClick={connect}
          disabled={pending || !hasCredentialInput || !connectionReady || credentialInputInvalid}
        >
          {pending
            ? "Connecting…"
            : (submitLabel ??
              (editingCredential === "api"
                ? status.apiKeyConfigured
                  ? "Replace API key"
                  : "Add API key"
                : editingCredential === "publishing"
                  ? publishingConfigured
                    ? "Replace Console credential"
                    : "Connect Console session"
                  : "Connect Apify"))}
        </Button>
      </div>
    </div>
  );
}

function SecretToggle({
  visible,
  onToggle,
  topAligned = false,
}: {
  visible: boolean;
  onToggle: () => void;
  topAligned?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        "text-muted-foreground hover:text-foreground absolute right-3 " +
        (topAligned ? "top-3" : "top-1/2 -translate-y-1/2")
      }
      aria-label={visible ? "Hide Console credential" : "Show Console credential"}
    >
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

function CredentialSummary({
  icon: Icon,
  title,
  detail,
  configured,
  validationStatus,
  actionLabel,
  onAction,
  pending,
}: {
  icon: typeof KeyRound;
  title: string;
  detail: string;
  configured?: boolean;
  validationStatus?: string;
  actionLabel: string;
  onAction: () => void;
  pending: boolean;
}) {
  const unhealthy = configured && isUnhealthyStatus(validationStatus);
  return (
    <div className="border-border/80 flex flex-col gap-4 border-b py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="border-border bg-muted/25 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{title}</p>
            <Badge
              variant={
                unhealthy
                  ? "destructive"
                  : configured && ["VALID", "CONNECTED"].includes(validationStatus ?? "")
                    ? "success"
                    : "outline"
              }
            >
              {configured
                ? validationStatus?.replaceAll("_", " ") || "CONFIGURED"
                : "NOT CONFIGURED"}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-xs leading-5">{detail}</p>
          {unhealthy ? (
            <p className="text-destructive mt-1 text-xs">
              {credentialFailureCopy(title, validationStatus)}
            </p>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit shrink-0"
        onClick={onAction}
        disabled={pending}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

function credentialFailureCopy(label: string, status?: string): string {
  const suffix = status === "EXPIRED" ? "has expired" : "is not working";
  return `${label} ${suffix}. Replace this credential only.`;
}

function isUnhealthyStatus(status?: string): boolean {
  return status === "EXPIRED" || status === "INVALID" || status === "ERROR";
}

function formatValidationTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Unknown";
  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed)} UTC`;
}
