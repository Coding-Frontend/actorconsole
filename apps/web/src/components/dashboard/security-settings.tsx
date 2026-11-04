"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { AccountApiError, accountMutation, accountRequest } from "@/lib/account-api";
import { notifySessionChanged } from "@/lib/session-events";
import { DashboardAsyncState, DashboardPageHeader } from "./dashboard-workbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SecurityStatus {
  enabled: boolean;
  setupPending: boolean;
  recoveryCodesRemaining: number;
}
type Action = "regenerate" | "disable";

export function SecuritySettings() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reauthenticate, setReauthenticate] = useState(false);
  const [setupKey, setSetupKey] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [actionCode, setActionCode] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError(null);
    try {
      const result = await accountRequest<SecurityStatus>("/2fa", { signal: request.signal });
      if (typeof result.enabled !== "boolean" || typeof result.recoveryCodesRemaining !== "number")
        throw new Error("Security status was incomplete. Please try again.");
      if (!request.signal.aborted) setStatus(result);
    } catch (failure) {
      if (!request.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Could not load security settings.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, [load]);

  function report(failure: unknown, inDialog = false) {
    const message =
      failure instanceof Error ? failure.message : "The change could not be saved. Try again.";
    if (inDialog) setActionError(message);
    else setError(message);
    if (failure instanceof AccountApiError && failure.code === "reauthentication_required")
      setReauthenticate(true);
  }

  async function startSetup() {
    if (pending.current || !status || status.enabled) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await accountMutation<{ secret: string }>("/2fa/setup");
      if (!result.secret) throw new Error("The setup key was not returned. Start setup again.");
      if (!mounted.current) return;
      setSetupKey(result.secret);
      setCode("");
      setCopied(null);
      setStatus({ ...status, setupPending: true });
    } catch (failure) {
      if (mounted.current) report(failure);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function confirmSetup(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !setupKey || !/^\d{6}$/.test(code.trim())) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await accountMutation<{ enabled: boolean; recoveryCodes?: string[] }>(
        "/2fa/confirm",
        { code: code.trim() },
      );
      if (!result.enabled) throw new Error("Two-factor authentication could not be confirmed.");
      if (!mounted.current) return;
      const codes = result.recoveryCodes ?? [];
      if (result.recoveryCodes)
        setStatus({ enabled: true, setupPending: false, recoveryCodesRemaining: codes.length });
      else await load(); // Another tab may already have confirmed this setup.
      setSetupKey(null);
      setCode("");
      setRecoveryCodes(codes);
      setCopied(null);
      setNotice("Two-factor authentication is enabled.");
    } catch (failure) {
      if (mounted.current) report(failure);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function completeAction(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !action || !actionCode.trim()) return;
    pending.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const result = await accountMutation<{ recoveryCodes?: string[] }>(
        action === "disable" ? "/2fa/disable" : "/2fa/recovery-codes",
        { code: actionCode.trim() },
      );
      if (!mounted.current) return;
      if (action === "disable") {
        setStatus({ enabled: false, setupPending: false, recoveryCodesRemaining: 0 });
        setRecoveryCodes([]);
        setNotice("Two-factor authentication is turned off.");
      } else {
        if (!result.recoveryCodes?.length)
          throw new Error(
            "New recovery codes were not returned. Check your security status before trying again.",
          );
        setRecoveryCodes(result.recoveryCodes);
        setStatus({
          enabled: true,
          setupPending: false,
          recoveryCodesRemaining: result.recoveryCodes.length,
        });
        setNotice("New recovery codes are ready. Your previous recovery codes no longer work.");
      }
      setAction(null);
      setActionCode("");
      setCopied(null);
      setError(null);
    } catch (failure) {
      if (mounted.current) report(failure, true);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function copy(value: string, kind: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setError(
        "Could not copy automatically. Select the displayed key or codes and copy them manually.",
      );
    }
  }

  async function signInAgain() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/auth/signout", { method: "POST" });
      if (!response.ok) throw new Error("Could not sign out. Please try again.");
      await Promise.race([
        import("@/lib/firebase").then((module) => module.signOutFirebase()).catch(() => undefined),
        new Promise((resolve) => window.setTimeout(resolve, 2000)),
      ]);
      notifySessionChanged();
      window.location.assign("/login?callbackUrl=%2Fdashboard%2Fsecurity");
    } catch (failure) {
      report(failure);
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <DashboardPageHeader
        context="Account / Security"
        title="Security"
        description="Manage your authenticator and recovery codes."
        breadcrumbs={[{ label: "Account" }, { label: "Security" }]}
      />
      {loading ? <DashboardAsyncState status="loading" title="Loading security settings" /> : null}
      {error ? (
        <DashboardAsyncState
          status="error"
          title="Security settings need attention"
          description={error}
          onRetry={!status ? () => void load() : undefined}
        />
      ) : null}
      {reauthenticate ? (
        <div className="space-y-3 text-sm">
          <p>
            A recent sign-in is required for security changes. Return here after signing in again.
          </p>
          <Button
            variant="outline"
            disabled={busy}
            className="h-auto min-h-11 whitespace-normal py-3"
            onClick={() => void signInAgain()}
          >
            Sign out and sign in again
          </Button>
        </div>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="border-signal-green/30 bg-signal-green/5 rounded-md border p-4 text-sm"
        >
          {notice}
        </p>
      ) : null}
      {status && !loading ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3 text-base">
              <ShieldCheck aria-hidden="true" className="h-5 w-5" /> Two-factor authentication{" "}
              <Badge variant={status.enabled ? "success" : "secondary"}>
                {status.enabled ? "Enabled" : "Off"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              An authenticator app adds a verification code when you sign in. Recovery codes let you
              sign in if your authenticator is unavailable.
            </p>
            {status.enabled ? (
              <>
                <p className="text-sm">
                  {status.recoveryCodesRemaining} unused recovery codes remaining.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Button
                    variant="outline"
                    className="h-auto min-h-11 whitespace-normal py-3"
                    disabled={busy}
                    onClick={() => {
                      setAction("regenerate");
                      setActionCode("");
                      setActionError(null);
                    }}
                  >
                    Regenerate recovery codes
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto min-h-11 whitespace-normal py-3 text-destructive"
                    disabled={busy}
                    onClick={() => {
                      setAction("disable");
                      setActionCode("");
                      setActionError(null);
                    }}
                  >
                    Turn off two-factor authentication
                  </Button>
                </div>
              </>
            ) : setupKey ? (
              <form onSubmit={confirmSetup} className="space-y-5">
                <fieldset disabled={busy} className="min-w-0 space-y-5">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">
                      1. Add ActorConsole to your authenticator
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Choose a time-based account in your authenticator app and enter this setup
                      key.
                    </p>
                    <code
                      aria-label="Authenticator setup key"
                      className="block select-all break-all rounded-sm border bg-muted p-3 font-mono text-sm"
                    >
                      {setupKey}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-11 whitespace-normal py-3"
                      onClick={() => void copy(setupKey, "setup")}
                    >
                      {copied === "setup" ? (
                        <Check aria-hidden="true" />
                      ) : (
                        <Copy aria-hidden="true" />
                      )}{" "}
                      {copied === "setup" ? "Setup key copied" : "Copy setup key"}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="setup-code">2. Enter the six-digit authenticator code</Label>
                    <Input
                      id="setup-code"
                      value={code}
                      onChange={(event) =>
                        setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      minLength={6}
                      maxLength={6}
                      required
                      className="h-12 text-base"
                      aria-describedby="setup-code-hint"
                    />
                    <p id="setup-code-hint" className="text-xs text-muted-foreground">
                      Two-factor authentication stays off until this code is confirmed.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="submit"
                      disabled={busy || code.length !== 6}
                      className="h-auto min-h-11 whitespace-normal py-3"
                    >
                      {busy ? (
                        <Loader2 aria-hidden="true" className="animate-spin" />
                      ) : (
                        <KeyRound aria-hidden="true" />
                      )}{" "}
                      Enable two-factor authentication
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-11 whitespace-normal py-3"
                      onClick={() => {
                        setSetupKey(null);
                        setCode("");
                        setError(null);
                      }}
                    >
                      Cancel setup
                    </Button>
                  </div>
                </fieldset>
              </form>
            ) : (
              <div className="space-y-3">
                {status.setupPending ? (
                  <p className="text-sm text-muted-foreground">
                    Your previous setup was not confirmed. Start again to get a new setup key.
                  </p>
                ) : null}
                <Button
                  disabled={busy}
                  onClick={() => void startSetup()}
                  className="h-auto min-h-11 whitespace-normal py-3"
                >
                  {busy ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : (
                    <KeyRound aria-hidden="true" />
                  )}{" "}
                  Set up authenticator
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
      {recoveryCodes.length ? (
        <Card className="border-signal-orange/40">
          <CardHeader>
            <CardTitle className="text-base">Save your recovery codes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Each code works once. Save these somewhere private before leaving this page; the codes
              are only shown here now.
            </p>
            <ul aria-label="New recovery codes" className="grid min-w-0 gap-2 sm:grid-cols-2">
              {recoveryCodes.map((value) => (
                <li key={value}>
                  <code className="block select-all break-all rounded-sm border bg-muted p-3 font-mono text-sm">
                    {value}
                  </code>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                variant="outline"
                className="h-auto min-h-11 whitespace-normal py-3"
                onClick={() => void copy(recoveryCodes.join("\n"), "recovery")}
              >
                {copied === "recovery" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{" "}
                {copied === "recovery" ? "Recovery codes copied" : "Copy recovery codes"}
              </Button>
              <Button
                className="h-auto min-h-11 whitespace-normal py-3"
                onClick={() => setRecoveryCodes([])}
              >
                I saved my recovery codes
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !pending.current) {
            setAction(null);
            setActionCode("");
            setActionError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "disable"
                ? "Turn off two-factor authentication?"
                : "Regenerate recovery codes?"}
            </DialogTitle>
            <DialogDescription>
              {action === "disable"
                ? "After this change, signing in will no longer ask for your authenticator code."
                : "Your previous recovery codes will stop working. Save the new codes after confirming."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={completeAction} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="security-action-code">Authenticator or unused recovery code</Label>
              <Input
                id="security-action-code"
                value={actionCode}
                onChange={(event) => setActionCode(event.target.value)}
                autoComplete="one-time-code"
                maxLength={20}
                minLength={6}
                required
                disabled={busy}
                className="h-12 text-base"
                aria-invalid={Boolean(actionError)}
                aria-describedby={actionError ? "security-action-error" : undefined}
              />
            </div>
            {actionError ? (
              <p id="security-action-error" role="alert" className="text-sm text-destructive">
                {actionError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="h-auto min-h-11 whitespace-normal py-3"
                onClick={() => {
                  setAction(null);
                  setActionCode("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={action === "disable" ? "destructive" : "default"}
                disabled={busy || actionCode.trim().length < 6}
                className="h-auto min-h-11 whitespace-normal py-3"
              >
                {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                {action === "disable"
                  ? "Turn off two-factor authentication"
                  : "Generate new recovery codes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
