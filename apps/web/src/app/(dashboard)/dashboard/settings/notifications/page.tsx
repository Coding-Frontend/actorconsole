"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useState, useEffect, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { Bell, Loader2 } from "lucide-react";

const API_BASE = API_BASE_URL;

interface Prefs {
  marketing: boolean;
  product: boolean;
  billing: boolean;
  security: boolean;
}

const TOGGLES: Array<{ key: keyof Prefs; label: string; desc: string }> = [
  {
    key: "marketing",
    label: "Marketing & offers",
    desc: "Tips, product updates, and promotional content.",
  },
  {
    key: "product",
    label: "Product updates",
    desc: "New features, changelog highlights, and improvements.",
  },
  {
    key: "billing",
    label: "Billing & invoices",
    desc: "Payment receipts, subscription changes, and billing alerts.",
  },
  {
    key: "security",
    label: "Security alerts",
    desc: "Login from new device, MCP credential changes, and security events.",
  },
];

export default function NotificationPrefsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, startSave] = useTransition();

  useEffect(() => {
    fetch(`${API_BASE}/account/notification-preferences`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setPrefs(j.data);
        else throw new Error(j.error?.message ?? "Could not load notification preferences");
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not load notification preferences",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: keyof Prefs) {
    if (!prefs) return;
    setPrefs({ ...prefs, [key]: !prefs[key] });
  }

  function save() {
    startSave(async () => {
      try {
        const res = await fetch(`${API_BASE}/account/notification-preferences`, {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(prefs),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.success("Preferences saved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="Account / Delivery"
        title="Notification preferences"
        description="Choose which email updates you receive."
        breadcrumbs={[{ label: "Account" }, { label: "Notification preferences" }]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Email preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {TOGGLES.map(({ key, label, desc }) => (
            <div
              key={key}
              className="border-border/60 flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-muted-foreground text-xs">{desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs?.[key] ?? true}
                aria-label={label}
                onClick={() => toggle(key)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  prefs?.[key] ? "bg-signal-orange" : "bg-input"
                }`}
              >
                <span
                  className={`bg-card absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow-sm transition-transform ${
                    prefs?.[key] ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
        Save preferences
      </Button>
    </div>
  );
}
