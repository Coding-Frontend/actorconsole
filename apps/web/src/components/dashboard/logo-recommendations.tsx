"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ImageIcon } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-base";
import { WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
import { WORKSPACE_CHANGED_EVENT } from "./onboarding-gate";
import { Button } from "@/components/ui/button";

export function LogoRecommendations() {
  const [total, setTotal] = useState(0);
  const loadController = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    try {
      const response = await fetch(
        `${API_BASE_URL}/actors/logo-recommendations?status=PENDING&limit=1`,
        {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        },
      );
      if (!response.ok) return;
      const body = (await response.json()) as { data: { total: number } };
      if (!controller.signal.aborted) setTotal(body.data.total);
    } catch {
      // The logo review link in the page header remains available if this
      // optional dashboard summary cannot be loaded.
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    const changed = () => {
      setTotal(0);
      void load();
    };
    window.addEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refresh);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, changed);
    return () => {
      loadController.current?.abort();
      window.removeEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refresh);
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, changed);
    };
  }, [load]);

  if (!total) return null;
  return (
    <div className="border-signal-blue/30 bg-signal-blue/10 flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <ImageIcon className="mt-0.5 h-5 w-5 shrink-0 text-signal-blue" aria-hidden="true" />
        <div>
          <p className="font-medium">
            {total} reviewed website logo{total === 1 ? " is" : "s are"} ready
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare thumbnails, select Actors, and apply reviewed logos in bulk.
          </p>
        </div>
      </div>
      <Button variant="outline" asChild>
        <Link href="/dashboard/actors/logos">
          Review logos
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
