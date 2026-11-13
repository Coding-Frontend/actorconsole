"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { accountMutation } from "@/lib/account-api";
import { useAccountResource } from "@/lib/use-account-resource";
import {
  DashboardAsyncState,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-workbench";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

interface Prefs {
  marketing: boolean;
  product: boolean;
  billing: boolean;
  security: boolean;
}
const toggles: Array<{ key: keyof Prefs; label: string; description: string }> = [
  {
    key: "marketing",
    label: "Marketing & offers",
    description: "Tips, product updates, and promotional content.",
  },
  {
    key: "product",
    label: "Product updates",
    description: "New features, changelog highlights, and improvements.",
  },
  {
    key: "billing",
    label: "Billing & invoices",
    description: "Payment receipts, subscription changes, and billing alerts.",
  },
  {
    key: "security",
    label: "Security alerts",
    description: "Login from new device, MCP credential changes, and security events.",
  },
];
function validPrefs(value: unknown): value is Prefs {
  return Boolean(
    value &&
    typeof value === "object" &&
    toggles.every(({ key }) => typeof (value as Prefs)[key] === "boolean"),
  );
}

export default function NotificationPrefsPage() {
  const resource = useAccountResource("/notification-preferences", validPrefs);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    if (resource.data) {
      const { marketing, product, billing, security } = resource.data;
      setPrefs({ marketing, product, billing, security });
    }
  }, [resource.data]);
  const dirty =
    prefs && resource.data && toggles.some(({ key }) => prefs[key] !== resource.data![key]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !prefs || !resource.data || resource.error || resource.loading) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await accountMutation<Prefs>("/notification-preferences", prefs, "PUT");
      if (!validPrefs(result))
        throw new Error(
          "Your saved preferences could not be verified. Reload before making another change.",
        );
      resource.setData(result);
      setSaved(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Preferences could not be saved. Please try again.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <div className="max-w-4xl space-y-6">
      <DashboardPageHeader
        context="Account / Delivery"
        title="Notification preferences"
        description="Choose which email updates you receive for the selected workspace."
        breadcrumbs={[{ label: "Account" }, { label: "Notification preferences" }]}
      />
      {resource.loading ? (
        <DashboardAsyncState status="loading" title="Loading your saved preferences" />
      ) : null}
      {resource.error ? (
        <DashboardAsyncState
          status="error"
          title="Notification preferences could not be loaded"
          description={resource.error}
          onRetry={() => void resource.retry()}
        />
      ) : null}
      {prefs && resource.data ? (
        <form onSubmit={save} className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell aria-hidden="true" className="h-4 w-4" /> Email preferences
              </CardTitle>
            </CardHeader>
            <CardContent>
              <fieldset
                disabled={saving || resource.loading || Boolean(resource.error)}
                className="space-y-3"
              >
                <legend className="sr-only">Email preferences</legend>
                {toggles.map(({ key, label, description }) => (
                  <button
                    key={key}
                    type="button"
                    role="switch"
                    aria-checked={prefs[key]}
                    aria-labelledby={`preference-${key}-label`}
                    aria-describedby={`preference-${key}-description`}
                    onClick={() => {
                      setPrefs((current) =>
                        current ? { ...current, [key]: !current[key] } : current,
                      );
                      setSaved(false);
                      setError(null);
                    }}
                    className="flex min-h-16 w-full items-center justify-between gap-4 rounded-md border border-border p-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span id={`preference-${key}-label`} className="block text-sm font-medium">
                        {label}
                      </span>
                      <span
                        id={`preference-${key}-description`}
                        className="mt-1 block text-xs leading-5 text-muted-foreground"
                      >
                        {description}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`relative h-6 w-11 shrink-0 rounded-full ${prefs[key] ? "bg-signal-orange" : "bg-input"}`}
                    >
                      <span
                        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow-sm motion-safe:transition-transform ${prefs[key] ? "translate-x-5" : "translate-x-0"}`}
                      />
                    </span>
                  </button>
                ))}
              </fieldset>
            </CardContent>
          </Card>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button
            type="submit"
            loading={saving}
            loadingText="Saving preferences…"
            disabled={!saving && (!dirty || resource.loading || Boolean(resource.error))}
            className="min-h-11 w-full sm:w-auto"
          >
            Save preferences
          </Button>
          {saved ? <Alert tone="success">Preferences saved.</Alert> : null}
        </form>
      ) : null}
    </div>
  );
}
