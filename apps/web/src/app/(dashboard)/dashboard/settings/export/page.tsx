"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Loader2, ShieldCheck } from "lucide-react";

const API_BASE = API_BASE_URL;

export default function ExportPage() {
  const [exporting, startExport] = useTransition();
  const [exported, setExported] = useState(false);

  function handleExport() {
    startExport(async () => {
      try {
        const res = await fetch(`${API_BASE}/account/export`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `actorconsole-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setExported(true);
        toast.success("Export downloaded");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Export failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="Account / Portability"
        title="Data export"
        description="Download the data associated with your account and workspaces."
        breadcrumbs={[{ label: "Account" }, { label: "Data export" }]}
      />

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" />
            Export your data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            This will include your profile, actors, schedules, subscriptions, payments,
            notifications, and support tickets.
          </p>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <ShieldCheck className="text-signal-green h-3.5 w-3.5" />
            Your data is yours. Export any time.
          </div>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            {exported ? "Export again" : "Download my data"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
