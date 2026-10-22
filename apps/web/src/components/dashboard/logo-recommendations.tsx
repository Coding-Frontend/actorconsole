"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ImageIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-base";
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

  const load = useCallback(async () => {
    const response = await fetch(
      `${API_BASE_URL}/actors/logo-recommendations?status=PENDING&limit=100`,
      {
        credentials: "include",
        cache: "no-store",
      },
    );
    if (!response.ok) return;
    const body = (await response.json()) as { data: { items: Recommendation[] } };
    setItems(body.data.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "apply" | "dismiss") {
    if (!selected) return;
    setWorking(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/actors/logo-recommendations/${selected.id}/${action}`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const body = (await response.json()) as {
        error?: { message?: string; details?: { link?: string } };
      };
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
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Logo update failed");
    } finally {
      setWorking(false);
    }
  }

  if (!items.length) return null;
  return (
    <>
      <div className="border-signal-blue/30 bg-signal-blue/10 flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ImageIcon className="text-signal-blue mt-0.5 h-5 w-5" />
          <div>
            <p className="font-medium">
              {items.length} reviewed website logo{items.length === 1 ? " is" : "s are"} ready
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Review each change before ActorConsole updates the real Apify thumbnail.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setSelected(items[0])}>
          Review logos
        </Button>
      </div>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
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
              <div className="border-border rounded-md border p-4">
                <p className="text-muted-foreground mb-3 text-xs uppercase tracking-wider">
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
                  <div className="bg-muted mx-auto grid h-40 w-40 place-items-center rounded-xl text-4xl">
                    {selected.actor.actorName.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="border-signal-blue/40 bg-signal-blue/5 rounded-md border p-4">
                <p className="text-signal-blue mb-3 text-xs uppercase tracking-wider">
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
                <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm sm:col-span-2">
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
