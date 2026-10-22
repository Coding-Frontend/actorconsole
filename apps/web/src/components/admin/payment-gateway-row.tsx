"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  FlaskConical,
  PackagePlus,
  Save,
  AlertCircle,
  LockKeyhole,
  Webhook,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/admin/api";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";

import { INTEGRATION_BY_KEY } from "@actorconsole/shared/integrations-catalog";
import {
  PAYMENT_GATEWAY_BY_KEY,
  gatewayProductKeys,
  currencyMinorUnitFactor,
  proCheckoutProductKey,
  isValidPaymentGateway,
  type ProBillingOption,
  type PaymentMode,
  type PaymentModeProfile,
} from "@actorconsole/shared/payment-gateways";

export interface PaymentGatewayView {
  key: string;
  name: string;
  enabled: boolean;
  updatedAt: string | null;
  callbackUrl: string | null;
  environment?: string | null;
  mode?: PaymentMode;
  profiles?: PaymentModeProfile[];
  billingOptions?: ProBillingOption[];
  readiness: {
    ready: boolean;
    configuredKeys: string[];
    missingCredentials: string[];
    missingProducts: string[];
  };
}

interface PaymentGatewayRowProps {
  gateway: PaymentGatewayView;
  webhookUrl: string;
}

export function PaymentGatewayRow({ gateway, webhookUrl }: PaymentGatewayRowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const activeMode = gateway.mode ?? (gateway.environment === "live_mode" ? "live" : "test");
  const [mode, setMode] = useState<PaymentMode>(activeMode);
  const [drafts, setDrafts] = useState<Partial<Record<PaymentMode, Record<string, string | null>>>>(
    {},
  );
  const [copied, setCopied] = useState(false);
  const [planDrafts, setPlanDrafts] = useState<
    Partial<Record<PaymentMode, Partial<Record<"month" | "year", string>>>>
  >({});
  const [action, setAction] = useState<string | null>(null);
  const hasPlanChanges = Object.values(planDrafts).some(
    (plans) => Object.keys(plans ?? {}).length > 0,
  );
  const hasUnsavedChanges =
    hasPlanChanges || Object.values(drafts).some((draft) => Object.keys(draft ?? {}).length > 0);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges]);
  const definition = isValidPaymentGateway(gateway.key)
    ? PAYMENT_GATEWAY_BY_KEY[gateway.key]
    : null;

  async function toggle(enabled: boolean) {
    const res = await api(`/admin/payment-gateways/${gateway.key}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      toast.error(res.error?.message ?? `Failed to update ${gateway.name}`);
      return;
    }

    toast.success(`${gateway.name} ${enabled ? "enabled" : "disabled"}`);
    router.refresh();
  }

  const profile = gateway.profiles?.find((item) => item.mode === mode);
  const readiness = profile?.readiness ?? gateway.readiness;
  const draft = drafts[mode] ?? {};
  const fields =
    profile?.fields ??
    (definition
      ? [
          ...definition.credentialKeys,
          ...(gateway.key === "dodo" ? ["dodo_brand_id"] : []),
          ...gatewayProductKeys(definition.key),
          definition.callbackKey,
        ].map((key) => ({
          key,
          label: INTEGRATION_BY_KEY[key]?.label ?? key,
          description: INTEGRATION_BY_KEY[key]?.description ?? "",
          isSecret: INTEGRATION_BY_KEY[key]?.isSecret ?? false,
          configured: readiness.configuredKeys.includes(key),
          value: key === definition.callbackKey ? (gateway.callbackUrl ?? "") : "",
        }))
      : []);
  const dirty = Object.keys(draft).length > 0;
  const currentPlanDirty = Object.keys(planDrafts[mode] ?? {}).length > 0;
  const modeWebhookUrl = `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}mode=${mode}`;
  const productKeys = definition ? gatewayProductKeys(definition.key) : [];
  const credentialFields = fields.filter(
    (field) =>
      !productKeys.includes(field.key) &&
      !definition?.productKeys.includes(field.key) &&
      field.key !== definition?.callbackKey &&
      !field.key.includes("webhook"),
  );
  const webhookFields = fields.filter(
    (field) => field.key.includes("webhook") || field.key === definition?.callbackKey,
  );

  const billingOptions = profile?.billingOptions ?? gateway.billingOptions ?? [];
  const missingCredentials = readiness.missingCredentials.map(
    (key) => INTEGRATION_BY_KEY[key]?.label ?? key,
  );

  function runAction(label: string, operation: () => Promise<void>) {
    startTransition(async () => {
      setAction(label);
      try {
        await operation();
      } catch {
        toast.error("Could not reach the payment service. Try again; your changes have been kept.");
      } finally {
        setAction(null);
      }
    });
  }

  function editField(key: string, value: string | null) {
    setDrafts((current) => ({ ...current, [mode]: { ...current[mode], [key]: value } }));
  }

  async function saveConfiguration() {
    const res = await api(`/admin/payment-gateways/${gateway.key}/configuration`, {
      method: "PUT",
      body: JSON.stringify({ mode, settings: draft }),
    });
    if (!res.ok) {
      toast.error(res.error?.message ?? "Could not save payment settings");
      return;
    }
    setDrafts((current) => ({ ...current, [mode]: {} }));
    toast.success(`${gateway.name} ${mode} settings saved`);
    router.refresh();
  }

  async function activateMode() {
    const res = await api(`/admin/payment-gateways/${gateway.key}/mode`, {
      method: "PUT",
      body: JSON.stringify({ mode }),
    });
    if (!res.ok) {
      toast.error(res.error?.message ?? "Could not change payment mode");
      return;
    }
    toast.success(`${gateway.name} now uses ${mode} mode for new checkouts`);
    router.refresh();
  }

  async function testConnection() {
    const res = await api(`/admin/payment-gateways/${gateway.key}/test`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
    if (!res.ok) {
      toast.error(res.error?.message ?? "Connection test failed");
      return;
    }
    toast.success((res.data as { message?: string })?.message ?? "Connection passed");
    router.refresh();
  }

  async function savePlan(cycle: "month" | "year", productId: string) {
    const res = await api(`/admin/payment-gateways/${gateway.key}/products/import`, {
      method: "POST",
      body: JSON.stringify({ productId: productId.trim(), interval: cycle, mode }),
    });
    if (!res.ok) {
      toast.error(res.error.message ?? "Plan verification failed");
      return;
    }
    setPlanDrafts((current) => {
      const next = { ...current[mode] };
      delete next[cycle];
      return { ...current, [mode]: next };
    });
    toast.success(
      `${cycle === "year" ? "Yearly" : "Monthly"} plan verified; product and price saved`,
    );
    router.refresh();
  }
  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(modeWebhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      toast.error("Could not copy the URL. Select the webhook URL and copy it manually.");
    }
  }

  function renderField(field: (typeof fields)[number]) {
    const inputId = `${gateway.key}-${mode}-${field.key}`;
    const removing = draft[field.key] === null;
    return (
      <div key={field.key} className="min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={inputId} className="leading-snug">
            {field.label}
          </Label>
          {field.configured && !removing ? (
            <Badge variant="secondary">
              <Check className="mr-1 size-3" aria-hidden="true" />
              Saved
            </Badge>
          ) : null}
        </div>
        <Input
          id={inputId}
          type={field.isSecret ? "password" : "text"}
          autoComplete="off"
          spellCheck={false}
          disabled={pending || removing}
          value={removing ? "" : (draft[field.key] ?? (field.isSecret ? "" : (field.value ?? "")))}
          onChange={(event) => editField(field.key, event.target.value)}
          placeholder={
            removing
              ? "Will be removed on save"
              : field.isSecret && field.configured
                ? "Leave blank to keep saved secret"
                : field.description
          }
          aria-describedby={`${inputId}-help`}
        />
        <div id={`${inputId}-help`} className="text-muted-foreground text-xs leading-relaxed">
          {field.isSecret && field.configured ? (
            <Button
              variant="link"
              size="sm"
              disabled={pending}
              className="h-auto whitespace-normal p-0 text-xs"
              onClick={() => editField(field.key, removing ? "" : null)}
            >
              {removing ? "Keep saved secret" : "Clear saved secret"}
            </Button>
          ) : (
            field.description
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="border-border border-b">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-sm">
              <CreditCard className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg">{gateway.name}</CardTitle>
              <p className="text-muted-foreground mt-1 text-xs">
                {gateway.updatedAt
                  ? `Updated ${formatDate(gateway.updatedAt)}`
                  : gateway.readiness.ready
                    ? "Credentials and subscription options are configured."
                    : "Complete setup to offer this provider at checkout."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={gateway.readiness.ready ? "success" : "warning"}>
              {gateway.readiness.ready ? "Configuration complete" : "Setup needed"}
            </Badge>
            <span className="text-sm" id={`${gateway.key}-checkout-label`}>
              Checkout {gateway.enabled ? "enabled" : "disabled"}
            </span>
            <Switch
              checked={gateway.enabled}
              onCheckedChange={(enabled) => runAction("Updating checkout", () => toggle(enabled))}
              disabled={pending || (!gateway.enabled && !gateway.readiness.ready)}
              aria-label={`Enable ${gateway.name} checkout`}
              aria-describedby={`${gateway.key}-checkout-label`}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <div className="border-border flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor={`${gateway.key}-mode`}>Configure environment</Label>
              <select
                id={`${gateway.key}-mode`}
                value={mode}
                disabled={pending}
                onChange={(event) => setMode(event.target.value as PaymentMode)}
                className="border-input bg-background focus-visible:ring-ring h-10 rounded-sm border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
              >
                <option value="test">Test mode</option>
                <option value="live">Live mode</option>
              </select>
              <span className="text-muted-foreground text-xs">
                Checkout uses{" "}
                <strong className="text-foreground font-medium">{activeMode} mode</strong>
              </span>
            </div>
            <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">
              {mode === "test"
                ? "Test payments do not charge real money."
                : "Live payments charge customers using live credentials."}{" "}
              Saving settings does not change the checkout mode.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={pending || dirty}
              onClick={() => runAction("Testing connection", testConnection)}
            >
              <FlaskConical aria-hidden="true" />
              Test {gateway.name}
            </Button>
            {activeMode !== mode ? (
              <Button
                variant="outline"
                disabled={pending || dirty || currentPlanDirty || !readiness.ready}
                onClick={() => runAction("Changing checkout mode", activateMode)}
              >
                Use {mode} mode for checkout
              </Button>
            ) : null}
          </div>
        </div>

        {!readiness.ready ? (
          <div className="bg-muted/50 mt-6 flex items-start gap-3 rounded-sm p-4" role="status">
            <AlertCircle
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <div className="space-y-1 text-sm leading-relaxed">
              <p className="font-medium">Finish {mode} setup before enabling checkout</p>
              <p className="text-muted-foreground">
                {missingCredentials.length > 0 ? `Add ${missingCredentials.join(", ")}. ` : ""}
                {readiness.missingProducts.length > 0
                  ? "Connect at least one Pro subscription option. "
                  : ""}
                {missingCredentials.length === 0 && readiness.missingProducts.length === 0
                  ? "Save credentials and at least one Pro option to complete this environment."
                  : "Save your settings, then test the connection."}
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid min-w-0 gap-8 pt-6 xl:grid-cols-2">
          <div className="min-w-0 space-y-8">
            <section aria-labelledby={`${gateway.key}-credentials-title`}>
              <h3
                id={`${gateway.key}-credentials-title`}
                className="flex items-center gap-2 font-semibold"
              >
                <LockKeyhole className="size-4" aria-hidden="true" />
                API credentials
              </h3>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                Use credentials from your provider&apos;s {mode} environment.
              </p>
              <div className="mt-5 space-y-5">{credentialFields.map(renderField)}</div>
              <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
                Credentials are encrypted. Saved secrets are never displayed.
              </p>
              {gateway.key === "dodo" ? (
                <Button
                  variant="link"
                  className="mt-3 h-auto whitespace-normal p-0 text-xs"
                  asChild
                >
                  <a
                    href="https://app.dodopayments.com/settings?tab=business"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Dodo business and branding{" "}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
            </section>

            <section
              aria-labelledby={`${gateway.key}-webhooks-title`}
              className="border-border border-t pt-6"
            >
              <h3
                id={`${gateway.key}-webhooks-title`}
                className="flex items-center gap-2 font-semibold"
              >
                <Webhook className="size-4" aria-hidden="true" />
                Webhooks &amp; redirect
              </h3>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                Register this URL in the provider&apos;s {mode} webhook settings.
              </p>
              <div className="mt-5 space-y-2">
                <Label htmlFor={`${gateway.key}-webhook`}>Webhook URL</Label>
                <div className="flex min-w-0 gap-2">
                  <Input
                    id={`${gateway.key}-webhook`}
                    readOnly
                    value={modeWebhookUrl}
                    className="min-w-0 font-mono text-xs"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={copyWebhook}
                    aria-label={copied ? "Webhook URL copied" : "Copy webhook URL"}
                    className="shrink-0"
                  >
                    {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Keep both test and live webhook URLs registered when switching environments.
                </p>
              </div>
              <div className="mt-5 space-y-5">{webhookFields.map(renderField)}</div>
            </section>
          </div>

          <section
            aria-labelledby={`${gateway.key}-subscriptions-title`}
            className="border-border min-w-0 border-t pt-6 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0"
          >
            <h3
              id={`${gateway.key}-subscriptions-title`}
              className="flex items-center gap-2 font-semibold"
            >
              <PackagePlus className="size-4" aria-hidden="true" />
              Pro subscriptions
            </h3>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Set up monthly and yearly billing for this environment.
            </p>
            <div className="border-border mt-5 divide-y rounded-sm border">
              {(["month", "year"] as const).map((cycle) => {
                const key = definition ? proCheckoutProductKey(definition.key, cycle) : "";
                const field = fields.find((item) => item.key === key);
                const option = billingOptions.find((item) => item.interval === cycle);
                const configured = Boolean(
                  field?.configured || readiness.configuredKeys.includes(key),
                );
                const value = planDrafts[mode]?.[cycle] ?? field?.value ?? "";
                const changed = planDrafts[mode]?.[cycle] !== undefined;
                const label = cycle === "year" ? "Yearly" : "Monthly";
                const idLabel =
                  gateway.key === "stripe"
                    ? "Recurring price ID"
                    : gateway.key === "razorpay"
                      ? "Plan ID"
                      : "Subscription product ID";
                return (
                  <div key={cycle} className="min-w-0 space-y-4 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold">{label} Pro plan</h4>
                      <Badge variant={changed ? "warning" : configured ? "success" : "outline"}>
                        {changed ? "Unsaved changes" : configured ? "Configured" : "Setup needed"}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {changed
                        ? "Verify this ID to refresh the plan price."
                        : option?.amountMinor !== undefined && option.currency
                          ? new Intl.NumberFormat("en", {
                              style: "currency",
                              currency: option.currency,
                            }).format(
                              option.amountMinor / currencyMinorUnitFactor(option.currency),
                            ) + (cycle === "year" ? " / year" : " / month")
                          : configured
                            ? "Verify the saved ID to load its price."
                            : "Connect an existing plan from your provider dashboard."}
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor={`${gateway.key}-${mode}-plan-${cycle}`}>
                        {label} {idLabel.toLowerCase()}
                      </Label>
                      <Input
                        id={`${gateway.key}-${mode}-plan-${cycle}`}
                        disabled={pending}
                        value={value}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder={`Enter the ${label.toLowerCase()} ${idLabel.toLowerCase()}`}
                        onChange={(event) =>
                          setPlanDrafts((current) => ({
                            ...current,
                            [mode]: { ...current[mode], [cycle]: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={pending || dirty || !value.trim()}
                        onClick={() =>
                          runAction(`Verifying ${label.toLowerCase()} plan`, () =>
                            savePlan(cycle, value),
                          )
                        }
                      >
                        {pending && action === `Verifying ${label.toLowerCase()} plan` ? (
                          <Loader2 className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Check aria-hidden="true" />
                        )}
                        Verify and save {label.toLowerCase()} plan
                      </Button>
                      {changed ? (
                        <Button
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            setPlanDrafts((current) => {
                              const next = { ...current[mode] };
                              delete next[cycle];
                              return { ...current, [mode]: next };
                            })
                          }
                        >
                          Discard {label.toLowerCase()} changes
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
              Prices and currency are read from the provider. Edit pricing in your provider
              dashboard, then verify and save the plan to refresh it here. Each ID must bill once
              per month or once per year. Existing subscriptions keep their current plan.
            </p>
          </section>
        </div>
      </CardContent>

      <div className="border-border bg-muted/30 flex flex-col justify-between gap-4 border-t px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <div className="text-sm" role="status" aria-live="polite">
          <p className="font-medium">
            {pending
              ? (action ?? "Updating settings…")
              : dirty
                ? `Unsaved ${mode} changes`
                : hasUnsavedChanges
                  ? hasPlanChanges
                    ? "Unsaved plan changes - save each plan separately"
                    : "Unsaved changes in the other environment"
                  : "No unsaved changes"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            {dirty
              ? "Save credentials before testing, verifying plans, or changing checkout mode."
              : "Each environment has its own credentials, products, and webhook secret."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {dirty ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setDrafts((current) => ({ ...current, [mode]: {} }))}
            >
              Discard changes
            </Button>
          ) : null}
          <Button
            className="flex-1 sm:flex-none"
            disabled={pending || !dirty}
            onClick={() => runAction("Saving settings", saveConfiguration)}
          >
            {pending && action === "Saving settings" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Save {mode} settings
          </Button>
        </div>
      </div>
    </Card>
  );
}
