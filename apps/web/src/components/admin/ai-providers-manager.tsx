"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  FlaskConical,
  KeyRound,
  Network,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/admin/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import {
  AI_PROVIDER_DEFAULTS,
  AI_PROVIDER_BY_KEY,
  type AiProviderKey,
} from "@actorconsole/shared/ai-providers";

const OPEN_CODE_FREE_MODEL_SUGGESTIONS = ["mimo-v2.5-free", "big-pickle"] as const;

export interface AiCredentialView {
  id: string;
  label: string;
  enabled: boolean;
  isConfigured: boolean;
  lastUsedAt: string | null;
  cooldownUntil: string | null;
  authErrorAt: string | null;
  lastTestedAt: string | null;
  testStatus: string | null;
  testMessage: string | null;
  updatedAt: string;
}

export interface AiProviderView {
  id: string;
  key: string;
  type: AiProviderKey;
  autoDisableOnError: boolean;
  disabledAt: string | null;
  disabledReason: string | null;
  name: string;
  enabled: boolean;
  priority: number;
  model: string;
  baseUrl: string;
  useProxy: boolean;
  lastTestedAt: string | null;
  testStatus: string | null;
  testMessage: string | null;
  updatedAt: string;
  readiness: {
    ready: boolean;
    credentialReady: boolean;
    proxyReady: boolean;
    credentialCount: number;
  };
  credentials: AiCredentialView[];
}

export interface AiProxyView {
  protocol: "http" | "https";
  host: string;
  port: number;
  username: string;
  passwordConfigured: boolean;
  lastTestedAt: string | null;
  testStatus: string | null;
  testMessage: string | null;
}

async function mutation(path: string, init: RequestInit) {
  const result = await api(path, init);
  if (!result.ok) throw new Error(result.error.message ?? "Request failed");
  return result.data;
}

function CredentialRow({
  providerKey,
  credential,
}: {
  providerKey: string;
  credential: AiCredentialView;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(credential.label);
  const [replacement, setReplacement] = useState("");
  const [removeOpen, setRemoveOpen] = useState(false);

  function run(action: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
        setReplacement("");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Request failed");
        router.refresh();
      }
    });
  }

  const path = `/admin/ai-providers/${providerKey}/credentials/${credential.id}`;

  async function removeCredential() {
    try {
      await mutation(path, { method: "DELETE" });
      toast.success("API key removed");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      toast.error(message);
      throw error;
    }
  }

  return (
    <div className="border-border/60 space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="text-muted-foreground h-4 w-4" />
          <span className="text-sm font-medium">{credential.label}</span>
          <Badge
            variant={
              credential.authErrorAt ? "destructive" : credential.enabled ? "success" : "secondary"
            }
          >
            {credential.authErrorAt
              ? "Authentication failed"
              : credential.enabled
                ? "Enabled"
                : "Disabled"}
          </Badge>
          {credential.cooldownUntil ? <Badge variant="warning">Cooling down</Badge> : null}
        </div>
        <Switch
          checked={credential.enabled}
          disabled={pending}
          onCheckedChange={(enabled) =>
            run(
              () => mutation(path, { method: "PUT", body: JSON.stringify({ enabled }) }),
              enabled ? "API key enabled" : "API key disabled",
            )
          }
          aria-label={`${credential.enabled ? "Disable" : "Enable"} ${credential.label}`}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          aria-label="Account label"
        />
        <Input
          type="password"
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          placeholder="Enter replacement API key"
          autoComplete="new-password"
          aria-label={`Replacement API key for ${credential.label}`}
        />
      </div>
      {credential.testStatus === "error" && credential.testMessage ? (
        <p className="text-destructive text-xs">{credential.testMessage}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                mutation(path, {
                  method: "PUT",
                  body: JSON.stringify({ label, ...(replacement ? { apiKey: replacement } : {}) }),
                }),
              "API key updated",
            )
          }
        >
          <Save className="h-4 w-4" /> Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(() => mutation(`${path}/test`, { method: "POST" }), "API key connection passed")
          }
        >
          <FlaskConical className="h-4 w-4" /> Test
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => setRemoveOpen(true)}
          aria-label={`Remove ${credential.label}`}
        >
          <Trash2 className="h-4 w-4" /> Remove
        </Button>
      </div>
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove API key?"
        description={`Remove ${credential.label} from ${providerKey}. AI requests will stop using this credential immediately.`}
        confirmLabel="Remove API key"
        destructive
        onConfirm={removeCredential}
      />
    </div>
  );
}

function ProviderCard({
  provider,
  index,
  providerKeys,
}: {
  provider: AiProviderView;
  index: number;
  providerKeys: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(provider.name);
  const [autoDisableOnError, setAutoDisableOnError] = useState(provider.autoDisableOnError);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [model, setModel] = useState(provider.model);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [useProxy, setUseProxy] = useState(provider.useProxy);
  const [newLabel, setNewLabel] = useState("");
  const [newApiKey, setNewApiKey] = useState("");

  function run(action: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Request failed");
        router.refresh();
      }
    });
  }

  function move(direction: -1 | 1) {
    const next = [...providerKeys];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    run(
      () =>
        mutation("/admin/ai-providers/reorder", {
          method: "PUT",
          body: JSON.stringify({ keys: next }),
        }),
      "Provider priority updated",
    );
  }

  return (
    <Card>
      <CardHeader className="border-border/50 border-b pb-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="whitespace-nowrap">
                Priority {index + 1}
              </Badge>
              <CardTitle className="break-words text-base">{provider.name}</CardTitle>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {AI_PROVIDER_BY_KEY[provider.type]?.name} · {provider.model}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant={
                provider.disabledAt ? "destructive" : provider.enabled ? "success" : "secondary"
              }
            >
              {provider.disabledAt
                ? "Automatically disabled"
                : provider.enabled
                  ? "Enabled"
                  : "Disabled"}
            </Badge>
            <Switch
              checked={provider.enabled}
              disabled={pending}
              onCheckedChange={(enabled) =>
                run(
                  () =>
                    mutation(`/admin/ai-providers/${provider.key}`, {
                      method: "PUT",
                      body: JSON.stringify({ enabled }),
                    }),
                  `${provider.name} ${enabled ? "enabled" : "disabled"}`,
                )
              }
              aria-label={`Enable ${provider.name}`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending || index === 0}
            onClick={() => move(-1)}
          >
            <ArrowUp className="h-4 w-4" /> Higher
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || index === providerKeys.length - 1}
            onClick={() => move(1)}
          >
            <ArrowDown className="h-4 w-4" /> Lower
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => mutation(`/admin/ai-providers/${provider.key}/test`, { method: "POST" }),
                "Provider connection passed",
              )
            }
          >
            <FlaskConical className="h-4 w-4" /> Test provider
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => setRemoveOpen(true)}
            aria-label={`Remove provider ${provider.name}`}
          >
            <Trash2 className="h-4 w-4" /> Remove provider
          </Button>
        </div>

        {provider.disabledReason ? (
          <p role="status" className="text-destructive break-words text-sm">
            {provider.disabledReason} Fix the settings or API key, test the provider, then enable it
            again.
          </p>
        ) : null}
        {!provider.readiness.ready ? (
          <p className="text-muted-foreground text-xs">
            {!provider.readiness.credentialReady
              ? "Add a working API key to enable this provider."
              : "Configure the shared proxy password to enable this provider."}
          </p>
        ) : null}

        <details className="space-y-5">
          <summary className="cursor-pointer text-sm font-medium">Settings and API keys</summary>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${provider.key}-name`}>Provider name</Label>
              <Input
                id={`${provider.key}-name`}
                value={name}
                maxLength={128}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${provider.key}-model`}>Model</Label>
              <Input
                id={`${provider.key}-model`}
                list={
                  provider.type === "opencode_free" ? `${provider.key}-model-options` : undefined
                }
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
              {provider.type === "opencode_free" ? (
                <>
                  <datalist id={`${provider.key}-model-options`}>
                    {OPEN_CODE_FREE_MODEL_SUGGESTIONS.map((suggestion) => (
                      <option key={suggestion} value={suggestion} />
                    ))}
                  </datalist>
                  <p className="text-muted-foreground text-xs">
                    Editable OpenCode Free model ID. Suggested current choices:{" "}
                    {OPEN_CODE_FREE_MODEL_SUGGESTIONS.join(" or ")}.
                  </p>
                </>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${provider.key}-url`}>Chat completions endpoint</Label>
              <Input
                id={`${provider.key}-url`}
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <Label htmlFor={`${provider.key}-proxy`} className="font-normal">
                Route through configured proxy
                <span className="text-muted-foreground block text-xs">
                  Uses the configured endpoint and credentials unchanged.
                </span>
              </Label>
              <Switch
                id={`${provider.key}-proxy`}
                checked={useProxy}
                onCheckedChange={setUseProxy}
                aria-label={`Use proxy for ${provider.name}`}
              />
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <Label htmlFor={`${provider.key}-auto-disable`} className="font-normal">
                Automatically disable on access or billing errors
                <span className="text-muted-foreground block text-xs">
                  The current request continues with the next enabled provider. Temporary rate
                  limits and server errors remain retryable.
                </span>
              </Label>
              <Switch
                id={`${provider.key}-auto-disable`}
                checked={autoDisableOnError}
                disabled={pending}
                onCheckedChange={setAutoDisableOnError}
                aria-label={`Automatically disable ${provider.name} on errors`}
              />
            </div>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    mutation(`/admin/ai-providers/${provider.key}`, {
                      method: "PUT",
                      body: JSON.stringify({
                        name,
                        autoDisableOnError,
                        model,
                        baseUrl,
                        useProxy,
                      }),
                    }),
                  "Provider settings saved",
                )
              }
            >
              <Save className="h-4 w-4" /> Save settings
            </Button>
          </div>

          {provider.testStatus === "error" && provider.testMessage ? (
            <p className="text-destructive text-xs">{provider.testMessage}</p>
          ) : null}

          <div className="space-y-3">
            <div>
              <Label>Accounts and API keys</Label>
              <p className="text-muted-foreground text-xs">
                API keys are required and remain write-only.
              </p>
            </div>
            {provider.credentials.map((credential) => (
              <CredentialRow
                key={`${credential.id}:${credential.updatedAt}`}
                providerKey={provider.key}
                credential={credential}
              />
            ))}
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                placeholder="Account label"
              />
              <Input
                type="password"
                value={newApiKey}
                onChange={(event) => setNewApiKey(event.target.value)}
                placeholder="API key"
                autoComplete="new-password"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !newLabel.trim() || !newApiKey.trim()}
              onClick={() =>
                run(async () => {
                  await mutation(`/admin/ai-providers/${provider.key}/credentials`, {
                    method: "POST",
                    body: JSON.stringify({ label: newLabel, apiKey: newApiKey }),
                  });
                  setNewLabel("");
                  setNewApiKey("");
                }, "API key added")
              }
            >
              <Plus className="h-4 w-4" /> Add account
            </Button>
          </div>
        </details>
      </CardContent>
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove provider?"
        description={`Remove ${provider.name} and all of its API keys. Requests will use the remaining enabled providers in priority order.`}
        confirmLabel="Remove provider"
        destructive
        onConfirm={async () => {
          await mutation(`/admin/ai-providers/${provider.key}`, { method: "DELETE" });
          toast.success("Provider removed");
          router.refresh();
        }}
      />
    </Card>
  );
}

function AddProviderCard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<AiProviderKey>("opencode_free");
  const [name, setName] = useState("OpenCode Free");
  const [model, setModel] = useState(AI_PROVIDER_BY_KEY.opencode_free.model);
  const [baseUrl, setBaseUrl] = useState(AI_PROVIDER_BY_KEY.opencode_free.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(false);

  function selectType(next: AiProviderKey) {
    const defaults = AI_PROVIDER_BY_KEY[next];
    setType(next);
    setName(defaults.name);
    setModel(defaults.model);
    setBaseUrl(defaults.baseUrl);
    setApiKey("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add AI provider</CardTitle>
        <p className="text-muted-foreground text-sm">
          Add several entries of the same type with separate keys, models and settings. New entries
          go at the end of the priority list.
        </p>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              try {
                await mutation("/admin/ai-providers", {
                  method: "POST",
                  body: JSON.stringify({
                    type,
                    name,
                    model,
                    baseUrl,
                    enabled,
                    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
                  }),
                });
                setApiKey("");
                setEnabled(false);
                toast.success("Provider added");
                router.refresh();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Request failed");
              }
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-provider-type">Provider type</Label>
              <select
                id="new-provider-type"
                value={type}
                disabled={pending}
                onChange={(event) => selectType(event.target.value as AiProviderKey)}
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              >
                {AI_PROVIDER_DEFAULTS.map((definition) => (
                  <option key={definition.key} value={definition.key}>
                    {definition.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-provider-name">New provider name</Label>
              <Input
                id="new-provider-name"
                required
                maxLength={128}
                value={name}
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-provider-model">New provider model</Label>
              <Input
                id="new-provider-model"
                required
                maxLength={191}
                value={model}
                disabled={pending}
                onChange={(event) => setModel(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-provider-key">New provider API key (required to enable)</Label>
              <Input
                id="new-provider-key"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={apiKey}
                disabled={pending}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-provider-endpoint">New provider endpoint</Label>
            <Input
              id="new-provider-endpoint"
              type="url"
              required
              value={baseUrl}
              disabled={pending}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="new-provider-enabled"
                checked={enabled}
                disabled={pending}
                onCheckedChange={setEnabled}
              />
              <Label htmlFor="new-provider-enabled">Enable on add</Label>
            </div>
            <Button
              type="submit"
              disabled={pending || !name.trim() || !model.trim() || (enabled && !apiKey.trim())}
            >
              <Plus className="h-4 w-4" /> Add provider
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ProxyCard({ proxy }: { proxy: AiProxyView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [protocol, setProtocol] = useState(proxy.protocol);
  const [host, setHost] = useState(proxy.host);
  const [port, setPort] = useState(String(proxy.port));
  const [username, setUsername] = useState(proxy.username);
  const [password, setPassword] = useState("");
  const [clearPasswordOpen, setClearPasswordOpen] = useState(false);

  function run(action: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
        setPassword("");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Request failed");
      }
    });
  }

  function save(clearPassword = false) {
    const parsedPort = Number(port);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
      toast.error("Proxy port must be between 1 and 65535");
      return;
    }
    run(
      () =>
        mutation("/admin/ai-providers/proxy", {
          method: "PUT",
          body: JSON.stringify({
            protocol,
            host,
            port: parsedPort,
            username,
            ...(password ? { password } : {}),
            ...(clearPassword ? { clearPassword: true } : {}),
          }),
        }),
      clearPassword ? "Proxy password removed" : "Proxy configuration saved",
    );
  }

  async function clearProxyPassword() {
    const parsedPort = Number(port);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
      throw new Error("Proxy port must be between 1 and 65535");
    }
    try {
      await mutation("/admin/ai-providers/proxy", {
        method: "PUT",
        body: JSON.stringify({
          protocol,
          host,
          port: parsedPort,
          username,
          clearPassword: true,
        }),
      });
      toast.success("Proxy password removed");
      setPassword("");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      toast.error(message);
      throw error;
    }
  }

  return (
    <Card>
      <CardHeader className="border-border/50 border-b pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Network className="text-signal-orange h-5 w-5" />
            <CardTitle className="text-base">Shared proxy</CardTitle>
          </div>
          <Badge variant={proxy.passwordConfigured ? "success" : "secondary"}>
            {proxy.passwordConfigured ? "Credentials configured" : "Password needed"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="grid gap-3 md:grid-cols-[110px_1fr_110px]">
          <div className="space-y-1.5">
            <Label htmlFor="ai-proxy-protocol">Protocol</Label>
            <select
              id="ai-proxy-protocol"
              value={protocol}
              onChange={(event) => setProtocol(event.target.value as "http" | "https")}
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-proxy-host">Host</Label>
            <Input
              id="ai-proxy-host"
              value={host}
              onChange={(event) => setHost(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-proxy-port">Port</Label>
            <Input
              id="ai-proxy-port"
              inputMode="numeric"
              value={port}
              onChange={(event) => setPort(event.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-proxy-username">Username</Label>
            <Input
              id="ai-proxy-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-proxy-password">Password</Label>
            <Input
              id="ai-proxy-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={
                proxy.passwordConfigured
                  ? "Configured — enter a replacement"
                  : "Enter proxy password"
              }
              autoComplete="new-password"
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Runtime requests use this username unchanged, including retries.
        </p>
        {proxy.testStatus === "error" && proxy.testMessage ? (
          <p className="text-destructive text-xs">{proxy.testMessage}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={() => save()}>
            <Save className="h-4 w-4" /> Save proxy
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !proxy.passwordConfigured}
            onClick={() =>
              run(
                () => mutation("/admin/ai-providers/proxy/test", { method: "POST" }),
                "Proxy connection passed",
              )
            }
          >
            <FlaskConical className="h-4 w-4" /> Test proxy
          </Button>
          {proxy.passwordConfigured ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => setClearPasswordOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Clear password
            </Button>
          ) : null}
        </div>
      </CardContent>
      <ConfirmDialog
        open={clearPasswordOpen}
        onOpenChange={setClearPasswordOpen}
        title="Clear proxy password?"
        description="AI providers configured to use this proxy will stop working until a new password is saved."
        confirmLabel="Clear password"
        destructive
        onConfirm={clearProxyPassword}
      />
    </Card>
  );
}

export function AiProvidersManager({
  providers,
  proxy,
}: {
  providers: AiProviderView[];
  proxy: AiProxyView;
}) {
  const providerKeys = providers.map((provider) => provider.key);
  return (
    <div className="space-y-6">
      <AddProviderCard />
      <p className="text-muted-foreground text-sm">
        Requests start with priority 1 and continue through enabled providers until one succeeds.
        Use Higher and Lower to sort the list. Automatically disabled entries stay off until you
        enable them again.
      </p>
      <div className="grid gap-4">
        {providers.map((provider, index) => (
          <ProviderCard
            key={`${provider.id}:${provider.updatedAt}`}
            provider={provider}
            index={index}
            providerKeys={providerKeys}
          />
        ))}
      </div>
      <ProxyCard
        key={`${proxy.host}:${proxy.port}:${proxy.passwordConfigured}:${proxy.lastTestedAt}`}
        proxy={proxy}
      />
    </div>
  );
}
