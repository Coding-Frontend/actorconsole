"use client";

import { navigateInApp } from "@/lib/client-navigation";

import { API_BASE_URL } from "@/lib/api-base";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Puzzle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const WEB_SOURCE = "actorconsole-web";
const EXTENSION_SOURCE = "actorconsole-extension";
const HANDOFF_START = "ACTORCONSOLE_APIFY_HANDOFF_START";
const HANDOFF_COOKIE = "ACTORCONSOLE_APIFY_HANDOFF_COOKIE";
const HANDOFF_RESULT = "ACTORCONSOLE_APIFY_HANDOFF_RESULT";
const HANDOFF_REGISTERED = "ACTORCONSOLE_APIFY_HANDOFF_REGISTERED";
const EXTENSION_READY = "ACTORCONSOLE_APIFY_EXTENSION_READY";
const EXTENSION_PING = "ACTORCONSOLE_APIFY_EXTENSION_PING";
const REGISTRATION_TIMEOUT_MS = 20_000;

type Handoff = {
  handoffId: string;
  challenge: string;
  expiresAt: string;
  workspace: { id: string; name: string };
  account: { id: string; type: "PERSONAL" | "ORGANIZATION" } | null;
};

export type ApifyExtensionConnectionResult = {
  connected: boolean;
  apifyUserId?: string | null;
  apifyUsername?: string | null;
  accountType?: "PERSONAL" | "ORGANIZATION";
  apiKeyConfigured?: boolean;
  uiTokenConfigured?: boolean;
  cookiesConfigured?: boolean;
  apiTokenStatus?: string;
  uiTokenStatus?: string;
  cookiesStatus?: string;
  credentialMode?: "FULL" | "API_ONLY" | "PUBLISHING_ONLY" | "LIMITED";
};

type ConnectionState =
  "idle" | "starting" | "waiting" | "completing" | "success" | "error" | "expired";

export function ApifyExtensionConnect({
  enabled,
  apiKeyConfigured,
  sessionConfigured,
  onConnected,
  compact = false,
}: {
  enabled: boolean;
  apiKeyConfigured?: boolean;
  sessionConfigured?: boolean;
  onConnected: (result: ApifyExtensionConnectionResult) => void | Promise<void>;
  compact?: boolean;
}) {
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const handoffRef = useRef<Handoff | null>(null);
  const completingRef = useRef(false);
  const expirationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoStartRef = useRef(false);

  const sendResultToExtension = useCallback(
    (handoffId: string, ok: boolean, resultMessage: string) => {
      window.postMessage(
        {
          source: WEB_SOURCE,
          type: HANDOFF_RESULT,
          payload: { handoffId, ok, message: resultMessage },
        },
        window.location.origin,
      );
    },
    [],
  );

  const completeHandoff = useCallback(
    async (handoff: Handoff, apifyRt: string, expectedApifyUserId: string) => {
      if (completingRef.current) return;
      completingRef.current = true;
      if (registrationTimerRef.current) clearTimeout(registrationTimerRef.current);
      // Once submitted, the API decides whether the handoff arrived in time.
      // Do not expire the UI while Apify is validating an accepted request.
      if (expirationTimerRef.current) clearTimeout(expirationTimerRef.current);
      setConnectionState("completing");
      setMessage("Validating the Apify Console session…");
      try {
        const response = await fetch(
          `${API_BASE_URL}/apify/extension/session/${encodeURIComponent(handoff.handoffId)}/complete`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ challenge: handoff.challenge, apifyRt, expectedApifyUserId }),
          },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.ok || !body.data) {
          throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
        }

        handoffRef.current = null;
        if (expirationTimerRef.current) clearTimeout(expirationTimerRef.current);
        setConnectionState("success");
        const complete = Boolean(body.data.apiKeyConfigured);
        setMessage(
          complete
            ? "Apify Console access is connected to this workspace."
            : "Apify Console is connected. Add an API key in this workspace to load Actors and use API operations.",
        );
        sendResultToExtension(
          handoff.handoffId,
          true,
          complete
            ? "Connected to ActorConsole"
            : "Apify Console connected. Add an API key in ActorConsole for Actor operations.",
        );
        await onConnected(body.data as ApifyExtensionConnectionResult);
        if (new URLSearchParams(window.location.search).has("workspace")) {
          navigateInApp("/dashboard/apify");
        }
      } catch (error) {
        const resultMessage =
          error instanceof Error
            ? error.message
            : "The Apify browser session could not be connected.";
        handoffRef.current = null;
        setConnectionState("error");
        setMessage(resultMessage);
        sendResultToExtension(handoff.handoffId, false, resultMessage);
      } finally {
        // Do not retain the authentication cookie in React state, browser
        // storage, a URL, or the clipboard. This local reference becomes
        // unreachable immediately after the request finishes.
        apifyRt = "";
        completingRef.current = false;
      }
    },
    [onConnected, sendResultToExtension],
  );

  useEffect(() => {
    if (!enabled) return;

    function onBridgeMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as {
        source?: string;
        type?: string;
        payload?: {
          handoffId?: string;
          challenge?: string;
          apifyRt?: string;
          expectedApifyUserId?: string;
          ok?: boolean;
          error?: string;
        };
      };
      if (data.source !== EXTENSION_SOURCE) return;
      if (data.type === EXTENSION_READY) {
        setExtensionDetected(true);
        return;
      }
      if (data.type === HANDOFF_REGISTERED) {
        if (!handoffRef.current || handoffRef.current.handoffId !== data.payload?.handoffId) return;
        if (registrationTimerRef.current) clearTimeout(registrationTimerRef.current);
        if (data.payload.ok === true) {
          setExtensionDetected(true);
          setMessage("Approve cookie access at the top of the extension sidebar to finish connecting.");
          return;
        }
        handoffRef.current = null;
        if (expirationTimerRef.current) clearTimeout(expirationTimerRef.current);
        setConnectionState("error");
        setMessage(
          data.payload.error ?? "Pair the extension with this ActorConsole account first.",
        );
        return;
      }
      if (data.type !== HANDOFF_COOKIE) return;

      const handoff = handoffRef.current;
      const payload = data.payload;
      if (
        !handoff ||
        payload?.handoffId !== handoff.handoffId ||
        payload.challenge !== handoff.challenge ||
        typeof payload.apifyRt !== "string" ||
        !payload.apifyRt ||
        typeof payload.expectedApifyUserId !== "string" ||
        !/^[A-Za-z0-9]{8,64}$/.test(payload.expectedApifyUserId)
      ) {
        return;
      }
      if (new Date(handoff.expiresAt).getTime() <= Date.now()) {
        handoffRef.current = null;
        setConnectionState("expired");
        setMessage("The extension connection expired. Start a new connection.");
        sendResultToExtension(handoff.handoffId, false, "Connection expired");
        return;
      }
      void completeHandoff(handoff, payload.apifyRt, payload.expectedApifyUserId);
    }

    window.addEventListener("message", onBridgeMessage);
    window.postMessage({ source: WEB_SOURCE, type: EXTENSION_PING }, window.location.origin);
    return () => window.removeEventListener("message", onBridgeMessage);
  }, [completeHandoff, enabled, sendResultToExtension]);

  useEffect(
    () => () => {
      if (expirationTimerRef.current) clearTimeout(expirationTimerRef.current);
      if (registrationTimerRef.current) clearTimeout(registrationTimerRef.current);
    },
    [],
  );

  const startConnection = useCallback(async () => {
    setConnectionState("starting");
    setMessage(null);
    handoffRef.current = null;
    if (expirationTimerRef.current) clearTimeout(expirationTimerRef.current);
    if (registrationTimerRef.current) clearTimeout(registrationTimerRef.current);

    try {
      const selectedWorkspace = new URLSearchParams(window.location.search).get("workspace");
      const selectedApifyAccountId = new URLSearchParams(window.location.search).get(
        "apifyAccountId",
      );
      const selectedApifyAccountType = new URLSearchParams(window.location.search).get(
        "apifyAccountType",
      );
      if (selectedWorkspace && (!selectedApifyAccountId || !selectedApifyAccountType)) {
        throw new Error(
          "The Apify account selection is missing. Start again from the extension sidebar.",
        );
      }
      if (selectedWorkspace) {
        const selection = await fetch(
          `${API_BASE_URL}/account/business-profiles/${encodeURIComponent(selectedWorkspace)}/select`,
          { method: "POST", credentials: "include" },
        );
        const selectionBody = await selection.json().catch(() => null);
        if (!selection.ok || !selectionBody?.ok) {
          throw new Error(selectionBody?.error?.message ?? "Could not select this workspace.");
        }
      }
      const response = await fetch(`${API_BASE_URL}/apify/extension/session`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(selectedApifyAccountId && selectedApifyAccountType
            ? { apifyAccountId: selectedApifyAccountId, apifyAccountType: selectedApifyAccountType }
            : {}),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      }
      const handoff = body.data as Handoff;
      handoffRef.current = handoff;
      setWorkspaceName(handoff.workspace.name);
      setConnectionState("waiting");
      setMessage(
        extensionDetected
          ? "Sending the connection request to the extension…"
          : "Checking the extension connection. Open its sidebar to continue…",
      );
      registrationTimerRef.current = setTimeout(() => {
        if (handoffRef.current?.handoffId !== handoff.handoffId) return;
        handoffRef.current = null;
        if (expirationTimerRef.current) clearTimeout(expirationTimerRef.current);
        setConnectionState("error");
        const resultMessage =
          "The extension did not respond. Reload this page after installing or updating the extension, open its sidebar, and try again.";
        setMessage(resultMessage);
        sendResultToExtension(handoff.handoffId, false, resultMessage);
      }, REGISTRATION_TIMEOUT_MS);
      window.postMessage(
        { source: WEB_SOURCE, type: HANDOFF_START, payload: handoff },
        window.location.origin,
      );

      const delay = Math.max(0, new Date(handoff.expiresAt).getTime() - Date.now());
      expirationTimerRef.current = setTimeout(() => {
        if (handoffRef.current?.handoffId !== handoff.handoffId) return;
        handoffRef.current = null;
        if (registrationTimerRef.current) clearTimeout(registrationTimerRef.current);
        setConnectionState("expired");
        setMessage("The extension connection expired. Start a new connection.");
        sendResultToExtension(handoff.handoffId, false, "Connection expired");
      }, delay);
    } catch (error) {
      setConnectionState("error");
      setMessage(
        error instanceof Error ? error.message : "Could not start the extension connection.",
      );
    }
  }, [extensionDetected, sendResultToExtension]);

  useEffect(() => {
    if (!enabled || !extensionDetected || autoStartRef.current) return;
    if (new URLSearchParams(window.location.search).get("extension") !== "connect") return;
    autoStartRef.current = true;
    void startConnection();
  }, [enabled, extensionDetected, startConnection]);

  if (!enabled) return null;

  const busy = connectionState === "starting" || connectionState === "completing";
  const waiting = connectionState === "waiting";
  const success = connectionState === "success";
  const failed = connectionState === "error" || connectionState === "expired";

  return (
    <section className={compact ? "space-y-3" : "border-border space-y-3 border p-4"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="border-border bg-muted/25 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border">
            <Puzzle className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium">Chrome extension</p>
            <p className="text-muted-foreground mt-1 max-w-2xl text-xs leading-5">
              {compact
                ? sessionConfigured
                  ? "Reconnect this workspace's Console session from the extension sidebar."
                  : "Add a Console session from the extension sidebar."
                : "Sign in to ActorConsole from the extension sidebar, select the detected Apify account and this workspace, then approve cookie access."}
            </p>
          </div>
        </div>
        <Button type="button" size="sm" onClick={startConnection} disabled={busy || waiting}>
          {busy ? <Loader2 className="animate-spin" /> : <Puzzle />}
          {connectionState === "starting"
            ? "Starting…"
            : connectionState === "completing"
              ? "Validating…"
              : waiting
                ? "Waiting for extension"
                : success
                  ? "Connect again"
                  : "Connect with extension"}
        </Button>
      </div>

      {message ? (
        <div
          className={
            "flex items-start gap-2 border p-3 text-xs leading-5 " +
            (success
              ? "border-signal-green/30 bg-signal-green/[0.05]"
              : failed
                ? "border-destructive/30 bg-destructive/[0.04]"
                : "border-border bg-background")
          }
          role={failed ? "alert" : "status"}
        >
          {success ? (
            <CheckCircle2 className="text-signal-green mt-0.5 h-4 w-4 shrink-0" />
          ) : failed ? (
            <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Loader2 className="text-signal-blue mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          )}
          <div>
            <p>{message}</p>
            {workspaceName && waiting ? (
              <p className="text-muted-foreground mt-1">Target workspace: {workspaceName}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!compact ? (
        <div className="text-muted-foreground flex items-start gap-2 text-xs leading-5">
          <ShieldCheck className="text-signal-green mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {apiKeyConfigured
              ? "Your saved API key remains unchanged."
              : "After this step, paste your Apify API key manually to enable Actor sync, runs, builds, and analytics."}
          </p>
        </div>
      ) : null}
    </section>
  );
}
