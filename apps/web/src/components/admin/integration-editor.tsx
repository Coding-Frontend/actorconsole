"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ExternalLink, Eye, EyeOff, Info, Save, Trash2, FlaskConical } from "lucide-react";
import { api } from "@/lib/admin/api";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/action-dialog";

interface Props {
  defKey: string;
  initialValue: string;
  isSecret: boolean;
  pattern?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
  testable: boolean;
  isConfigured: boolean;
}

export function IntegrationEditor({
  defKey,
  initialValue,
  isSecret,
  pattern,
  options,
  testable,
  isConfigured,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [cookieInputMode, setCookieInputMode] = useState<"domains" | "resumeCurl">("resumeCurl");
  const [consoleCookies, setConsoleCookies] = useState("");
  const [consoleBackendCookies, setConsoleBackendCookies] = useState("");
  const [reveal, setReveal] = useState(!isSecret);
  const [pending, startTransition] = useTransition();
  const [testResult, setTestResult] = useState<{ status: string; message: string } | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  async function save() {
    const submittedValue =
      defKey === "apify_cookies" && cookieInputMode === "domains"
        ? JSON.stringify({
            console: consoleCookies.trim(),
            consoleBackend: consoleBackendCookies.trim(),
          })
        : value;
    if (
      !submittedValue ||
      (defKey === "apify_cookies" &&
        cookieInputMode === "domains" &&
        !consoleCookies.trim() &&
        !consoleBackendCookies.trim())
    ) {
      toast.error("Value is empty");
      return;
    }
    const res = await api(`/admin/integrations/${defKey}`, {
      method: "PUT",
      body: JSON.stringify({ value: submittedValue }),
    });
    if (!res.ok) {
      toast.error(res.error.message ?? "Failed to save");
    } else {
      toast.success("Saved");
      router.refresh();
    }
  }

  async function remove() {
    const res = await api(`/admin/integrations/${defKey}`, { method: "DELETE" });
    if (!res.ok) {
      const message = res.error.message ?? "Failed to remove";
      toast.error(message);
      throw new Error(message);
    } else {
      toast.success("Removed");
      setValue("");
      router.refresh();
    }
  }

  async function test() {
    setTestResult(null);
    const res = await api(`/admin/integrations/${defKey}/test`, { method: "POST" });
    if (res.ok) {
      setTestResult({ status: "success", message: "Connection successful" });
      toast.success("Connection OK");
    } else {
      setTestResult({ status: "error", message: res.error.message ?? "Test failed" });
      toast.error(res.error.message ?? "Test failed");
    }
  }

  return (
    <div className="space-y-4">
      <ApifyCredentialInstructions defKey={defKey} />
      <div className="space-y-2">
        <Label htmlFor={defKey}>Value</Label>
        <div className="flex gap-2">
          {options?.length ? (
            <select
              id={defKey}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 flex-1 rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : defKey === "apify_cookies" ? (
            <div className="min-w-0 flex-1 space-y-3">
              <div className="border-border bg-background inline-flex border p-1">
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
                <Textarea
                  id={defKey}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="Paste the copied console-backend authentication/resume cURL"
                  className={
                    "min-h-40 font-mono text-xs " + (reveal ? "" : "[-webkit-text-security:disc]")
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  <Textarea
                    id={defKey + "-console"}
                    value={consoleCookies}
                    onChange={(event) => setConsoleCookies(event.target.value)}
                    placeholder="console.apify.com Cookie header or JSON export"
                    className={
                      "min-h-32 font-mono text-xs " + (reveal ? "" : "[-webkit-text-security:disc]")
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Textarea
                    id={defKey + "-backend"}
                    value={consoleBackendCookies}
                    onChange={(event) => setConsoleBackendCookies(event.target.value)}
                    placeholder="console-backend.apify.com export containing ApifyRT"
                    className={
                      "min-h-32 font-mono text-xs " + (reveal ? "" : "[-webkit-text-security:disc]")
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              )}
              <p className="text-muted-foreground text-xs leading-5">
                ApifyRT belongs to console-backend.apify.com. You may paste either export or both;
                only ApifyRT is saved, and unrelated browser cookies are discarded.
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setReveal(!reveal)}>
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {reveal ? "Hide cookie values" : "Show cookie values"}
              </Button>
            </div>
          ) : defKey === "apify_ui_token" ? (
            <div className="relative flex-1">
              <Textarea
                id={defKey}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Paste apify_ui_ token, response JSON, Authorization header, or cURL"
                className={
                  "min-h-28 pr-8 font-mono text-xs " +
                  (reveal ? "" : "[-webkit-text-security:disc]")
                }
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setReveal(!reveal)}
                className="text-muted-foreground hover:text-foreground absolute right-2 top-2"
                aria-label={reveal ? "Hide" : "Reveal"}
              >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <div className="relative flex-1">
              <Input
                id={defKey}
                type={reveal ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  isSecret && isConfigured
                    ? "Configured — enter a replacement"
                    : isSecret
                      ? "Enter secret value…"
                      : "Enter value…"
                }
                className="pr-8"
              />
              {isSecret ? (
                <button
                  type="button"
                  onClick={() => setReveal(!reveal)}
                  className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
                  aria-label={reveal ? "Hide" : "Reveal"}
                >
                  {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              ) : null}
            </div>
          )}
          <Button disabled={pending} onClick={() => startTransition(save)} size="sm">
            <Save className="h-4 w-4" />
            Save
          </Button>
          {isConfigured ? (
            <Button
              disabled={pending}
              onClick={() => setRemoveOpen(true)}
              variant="destructive"
              size="sm"
              aria-label="Remove integration"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        {pattern && !options?.length ? (
          <p className="text-muted-foreground text-xs">Expected format: {pattern}</p>
        ) : null}
      </div>

      {testable ? (
        <div className="space-y-2">
          <Button
            disabled={pending}
            onClick={() => startTransition(test)}
            variant="outline"
            size="sm"
          >
            <FlaskConical className="h-4 w-4" />
            Test connection
          </Button>
          {testResult ? (
            <p
              className={`text-xs ${testResult.status === "success" ? "text-signal-green" : "text-destructive"}`}
            >
              {testResult.status === "success" ? "Connection passed:" : "Connection failed:"}{" "}
              {testResult.message}
            </p>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove this integration credential?"
        description="ActorConsole will stop using this saved credential until a replacement is configured."
        confirmLabel="Remove credential"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}

function ApifyCredentialInstructions({ defKey }: { defKey: string }) {
  if (defKey !== "apify_api_token" && defKey !== "apify_ui_token" && defKey !== "apify_cookies") {
    return null;
  }

  const settingsUrl = "https://console.apify.com/settings/integrations";
  const content =
    defKey === "apify_api_token" ? (
      <>
        <p>
          Create or copy the API key in Apify{" "}
          <a
            href={settingsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-signal-blue hover:underline"
          >
            Settings → API &amp; Integrations <ExternalLink className="mb-0.5 inline h-3 w-3" />
          </a>
          . Use a key that can list and manage the Actors used by ActorConsole.
        </p>
        <p className="text-muted-foreground">
          This credential powers Actor discovery, builds, runs, metadata updates, schedules, and
          publication. A key can authenticate successfully and still be too restricted for these
          operations, so test it after saving.
        </p>
      </>
    ) : defKey === "apify_ui_token" ? (
      <>
        <p>
          No manual UI key is needed when Platform Apify Cookies are valid. ActorConsole obtains the
          UI token automatically from the backend session cookie.
        </p>
        <p>
          Sign in to the intended Apify account and copy the{" "}
          <code className="font-mono">apify_ui_</code> value from an authenticated Console request
          in DevTools → Network, or paste the full Authorization header/cURL here. The server stores
          only the normalized UI token.
        </p>
        <p className="text-muted-foreground">
          This is an optional Console credential for metadata, category feedback, pictures, and read
          operations. It does not replace the API key for Actor writes or publication.
        </p>
      </>
    ) : (
      <>
        <p>
          In Apify Console DevTools → Network, copy as cURL the request to{" "}
          <code className="break-all font-mono">
            console-backend.apify.com/public/authentication/resume
          </code>{" "}
          and paste it into Resume cURL, or use the two Domain exports fields.
        </p>
        <p className="text-muted-foreground">
          <code className="font-mono">ApifyRT</code> must come from{" "}
          <code className="font-mono">console-backend.apify.com</code>. It can rotate or expire;
          only this cookie is retained after normalization. ActorConsole automatically obtains a UI
          token from it, so a manual UI key is unnecessary. The API key is still required for Actor
          writes and publication.
        </p>
      </>
    );

  return (
    <div className="border-signal-blue/25 bg-signal-blue/[0.045] flex items-start gap-2 border p-3 text-xs leading-5">
      <Info className="text-signal-blue mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">{content}</div>
    </div>
  );
}
