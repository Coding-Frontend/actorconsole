"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, Loader2, Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Variant {
  title: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  reasoning: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  apifyActorId: string;
  onChanged?: () => void;
}

const API_BASE = API_BASE_URL;

export function CopyRewriteDialog({ open, onOpenChange, apifyActorId, onChanged }: Props) {
  const encodedActorId = encodeURIComponent(apifyActorId);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, startUpdate] = useTransition();
  const [keywords, setKeywords] = useState<string[]>([]);

  async function generate() {
    setLoading(true);
    setSelected(null);
    try {
      const res = await fetch(`${API_BASE}/actors/${encodedActorId}/rewrite-copy`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      setVariants(body.data.variants);
      setKeywords(body.data.keywords ?? []);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  function updateActor() {
    if (selected === null) return;
    startUpdate(async () => {
      try {
        const v = variants[selected]!;
        const res = await fetch(`${API_BASE}/actors/${encodedActorId}/copy`, {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: v.title,
            description: v.description,
            seoTitle: v.seoTitle,
            seoDescription: v.seoDescription,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        toast.success("Actor listing updated on Apify");
        onChanged?.();
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Actor update failed");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setVariants([]);
          setSelected(null);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="text-signal-orange h-5 w-5" />
            AI rewrite copy
          </DialogTitle>
          <DialogDescription>
            Generates 3 SEO-optimized title and description variants. Apify assigns and maintains
            the Store categories automatically.
          </DialogDescription>
        </DialogHeader>

        {variants.length === 0 ? (
          <div className="space-y-4 py-6 text-center">
            {loading ? (
              <>
                <Loader2 className="text-signal-orange mx-auto h-8 w-8 animate-spin" />
                <p className="text-muted-foreground text-sm">
                  Analyzing actor and generating variants…
                </p>
              </>
            ) : (
              <>
                <Sparkles className="text-signal-orange/50 mx-auto h-10 w-10" />
                <p className="text-muted-foreground text-sm">
                  Click below to generate 3 variants — outcome-led, use-case-led, and feature-led.
                </p>
                <Button onClick={generate} size="lg" variant="gradient">
                  <Sparkles className="h-4 w-4" />
                  Generate variants
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="text-muted-foreground">Keywords:</span>
                {keywords.map((k) => (
                  <Badge key={k} variant="outline">
                    {k}
                  </Badge>
                ))}
              </div>
            )}
            {variants.map((v, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(i)}
                className={cn(
                  "block w-full rounded-lg border p-4 text-left transition-all",
                  selected === i
                    ? "border-signal-orange bg-signal-orange/5 shadow-glow"
                    : "border-border/60 hover:border-signal-orange/40",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-signal-orange text-xs font-semibold uppercase tracking-wider">
                      Variant {i + 1}
                    </p>
                    <p className="mt-1 font-semibold">{v.title}</p>
                    <p className="text-muted-foreground mt-1 text-xs">{v.description}</p>
                    <div className="mt-2 space-y-1 text-xs">
                      <p>
                        <span className="text-muted-foreground">SEO title: </span>
                        <span className="font-mono">{v.seoTitle}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">SEO desc: </span>
                        <span className="font-mono">{v.seoDescription}</span>
                      </p>
                    </div>
                    <p className="text-muted-foreground mt-2 text-xs italic">{v.reasoning}</p>
                  </div>
                  {selected === i && <Check className="text-signal-orange h-5 w-5 shrink-0" />}
                </div>
              </button>
            ))}
          </div>
        )}

        <DialogFooter>
          {variants.length > 0 && (
            <>
              <Button variant="outline" onClick={generate} disabled={loading}>
                Regenerate
              </Button>
              <Button
                onClick={updateActor}
                disabled={selected === null || updating}
                variant="gradient"
              >
                {updating ? "Updating…" : "Update Actor"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
