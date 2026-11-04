"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-base";
import { WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
import { WORKSPACE_CHANGED_EVENT } from "@/components/dashboard/onboarding-gate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Recommendation = {
  id: string;
  error: string | null;
  proposedImageUrl: string;
  actor: {
    id: string;
    apifyActorId: string;
    title: string | null;
    actorName: string;
    currentImageUrl: string | null;
  };
  logo: { websiteIdentity: { name: string; canonicalDomain: string | null } };
};

export function LogoRecommendations() {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [selected, setSelected] = useState<Recommendation | null>(null);
  const [working, setWorking] = useState(false);
  const workspaceVersion = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const actionController = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    try {
      const response = await fetch(
        `${API_BASE_URL}/actors/logo-recommendations?status=PENDING&limit=100`,
        {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        },
      );
      if (!response.ok) return;
      const body = (await response.json()) as { data: { items: Recommendation[] } };
      if (!controller.signal.aborted) setItems(body.data.items);
    } catch {
      if (!controller.signal.aborted)
        toast.error("Could not load logo recommendations. Try refreshing.");
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    const changeWorkspace = () => {
      workspaceVersion.current += 1;
      actionController.current?.abort();
      setItems([]);
      setSelected(null);
      setWorking(false);
      void load();
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, changeWorkspace);
    window.addEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refresh);
    return () => {
      workspaceVersion.current += 1;
      loadController.current?.abort();
      actionController.current?.abort();
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, changeWorkspace);
      window.removeEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refresh);
    };
  }, [load]);

  async function act(action: "apply" | "dismiss") {
    if (!selected) return;
    const version = workspaceVersion.current;
    const controller = new AbortController();
    actionController.current = controller;
    setWorking(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/actors/logo-recommendations/${selected.id}/${action}`,
        {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
        },
      );
      const body = (await response.json()) as {
        error?: { message?: string; details?: { link?: string } };
      };
      if (controller.signal.aborted || version !== workspaceVersion.current) return;
      if (!response.ok) {
        const message = body.error?.message ?? `Could not ${action} logo`;
        toast.error(message);
        if (action === "apply") {
          setSelected((current) => (current ? { ...current, error: message } : current));
          await load();
        }
        return;
      }
      toast.success(action === "apply" ? "Logo updated on Apify" : "Logo recommendation dismissed");
      setSelected(null);
      window.dispatchEvent(new CustomEvent(WORKSPACE_DATA_REFRESHED_EVENT));
    } catch (error) {
      if (!controller.signal.aborted && version === workspaceVersion.current) {
        toast.error(error instanceof Error ? error.message : "Logo update failed");
      }
    } finally {
      if (version === workspaceVersion.current) setWorking(false);
    }
  }

  if (!items.length) return null;
  return (
    <>
      <div className="border-signal-blue/30 bg-signal-blue/10 flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ImageIcon className="mt-0.5 h-5 w-5 text-signal-blue" />
          <div>
            <p className="font-medium">
              {items.length} reviewed website logo{items.length === 1 ? " is" : "s are"} ready
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Review each change before ActorConsole updates the real Apify thumbnail.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setSelected(items[0])}>
          Review logos
        </Button>
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && !working && setSelected(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review website logo</DialogTitle>
            <DialogDescription>
              {selected?.logo.websiteIdentity.name} was matched to{" "}
              {selected?.actor.title ?? selected?.actor.actorName}. Nothing changes on Apify until
              you apply it.
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-border p-4">
                <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
                  Current Actor thumbnail
                </p>
                {selected.actor.currentImageUrl ? (
                  <Image
                    src={selected.actor.currentImageUrl}
                    alt="Current Actor thumbnail"
                    width={160}
                    height={160}
                    unoptimized
                    className="mx-auto rounded-xl object-contain"
                  />
                ) : (
                  <div className="mx-auto grid h-40 w-40 place-items-center rounded-xl bg-muted text-4xl">
                    {selected.actor.actorName.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="border-signal-blue/40 bg-signal-blue/5 rounded-md border p-4">
                <p className="mb-3 text-xs uppercase tracking-wider text-signal-blue">
                  Proposed website logo
                </p>
                <Image
                  src={selected.proposedImageUrl}
                  alt={`Proposed ${selected.logo.websiteIdentity.name} logo`}
                  width={160}
                  height={160}
                  unoptimized
                  className="mx-auto rounded-xl object-contain"
                />
              </div>
              {selected.error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2">
                  {selected.error}{" "}
                  <Link href="/dashboard/apify" className="underline">
                    Update credentials
                  </Link>
                </div>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                <Button variant="outline" disabled={working} onClick={() => void act("dismiss")}>
                  Dismiss
                </Button>
                <Button variant="signal" disabled={working} onClick={() => void act("apply")}>
                  {working ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Apply to Apify
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
