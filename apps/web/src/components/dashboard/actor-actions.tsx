"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, DollarSign, Loader2, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api-base";
import { trackEvent } from "@/lib/analytics-events";
import { toast } from "sonner";
import { PricingDialog } from "@/components/dashboard/pricing-dialog";
import { CopyRewriteDialog } from "@/components/dashboard/copy-rewrite-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";

interface PricingEvent {
  eventPriceUsd?: number;
  eventTitle?: string;
  eventDescription?: string;
  isOneTimeEvent?: boolean;
  isPrimaryEvent?: boolean;
}

interface Props {
  actorId: string;
  apifyActorId: string;
  apifyUsername: string;
  actorName: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  categories: string[];
  metaLabels?: Array<{ _id?: string; name?: string; type?: string; value?: string }>;
  pricingEvents: Record<string, PricingEvent>;
}

export function ActorActions({
  actorId,
  apifyActorId,
  apifyUsername,
  actorName,
  title,
  description,
  imageUrl,
  categories,
  metaLabels = [],
  pricingEvents,
}: Props) {
  const router = useRouter();
  const [startingKind, setStartingKind] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [categoryFeedbackOpen, setCategoryFeedbackOpen] = useState(false);
  const [categoryFeedback, setCategoryFeedback] = useState("");
  const [submittingCategoryFeedback, setSubmittingCategoryFeedback] = useState(false);

  async function submitCategoryFeedback() {
    const details = categoryFeedback.trim();
    if (details.length < 10) {
      toast.error("Describe the category correction in at least 10 characters.");
      return;
    }
    setSubmittingCategoryFeedback(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/actors/${encodeURIComponent(apifyActorId)}/categories/feedback`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ details }),
        },
      );
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Could not send category feedback");
      }
      toast.success("Category feedback sent to Apify.");
      setCategoryFeedback("");
      setCategoryFeedbackOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send category feedback");
    } finally {
      setSubmittingCategoryFeedback(false);
    }
  }

  async function createImprovementRun(kind: "GENERATE_IMPROVEMENTS", fields: string[]) {
    setStartingKind(kind);
    try {
      const response = await fetch(`${API_BASE_URL}/actors/optimization/runs`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actorIds: [actorId], kind, fields }),
      });
      const body = (await response.json()) as {
        data?: { runId?: string };
        error?: { message?: string };
      };
      if (!response.ok || !body.data?.runId) {
        throw new Error(body.error?.message ?? "Could not start this generation");
      }
      void trackEvent("actor_optimization_started", { kind });
      router.push(`/dashboard/actors/optimization/${body.data.runId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start this generation");
      setStartingKind(null);
    }
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <ActionRow
          icon={Sparkles}
          title="Rewrite copy"
          description="Generate three SEO variants for the title and description. Apify manages Store categories automatically."
          onClick={() => setCopyOpen(true)}
        />
        <ActionRow
          icon={DollarSign}
          title="Update pay-per-event pricing"
          description="Configure multiple Actor.charge events and preserve every pricing period in history."
          badge="Update"
          onClick={() => setPricingOpen(true)}
        />
        <ActionRow
          icon={Sparkles}
          title="Generate all improvements"
          description="Create one review run covering listing copy and pricing."
          loading={startingKind === "GENERATE_IMPROVEMENTS"}
          onClick={() =>
            void createImprovementRun("GENERATE_IMPROVEMENTS", [
              "title",
              "description",
              "pricing",
            ])
          }
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Current store state</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground text-xs">Title</p>
            <p className="font-medium">{title ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Description</p>
            <p className="line-clamp-4 text-sm">{description ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Store categories</p>
            {categories.length ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {categories.map((category) => (
                  <Badge key={category} variant="secondary">
                    {category
                      .toLowerCase()
                      .split("_")
                      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(" ")}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm">—</p>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 h-auto px-0 text-xs"
              onClick={() => setCategoryFeedbackOpen(true)}
            >
              <MessageSquareText className="mr-1 h-3.5 w-3.5" />
              Suggest a correction
            </Button>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Thumbnail</p>
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={actorName}
                width={128}
                height={128}
                unoptimized
                className="aspect-square w-32 rounded-md object-cover"
              />
            ) : (
              <div className="bg-muted text-muted-foreground flex aspect-square w-32 items-center justify-center rounded-md text-xs">
                No image
              </div>
            )}
          </div>
          {metaLabels.length > 0 ? (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-muted-foreground text-xs">Apify category metadata</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {metaLabels.map((label, index) => (
                  <Badge
                    key={label._id ?? `${label.type ?? "LABEL"}-${label.name}-${index}`}
                    variant="outline"
                  >
                    {label.type ? `${label.type.replaceAll("_", " ")}: ` : ""}
                    {label.name ?? label.value ?? label._id ?? "Category"}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="text-muted-foreground mt-6 text-center text-xs">
        <Link
          href={`https://apify.com/${apifyUsername}/${actorName}`}
          target="_blank"
          rel="noreferrer"
        >
          View on Apify Store →
        </Link>
      </div>

      <PricingDialog
        open={pricingOpen}
        onOpenChange={setPricingOpen}
        apifyActorId={apifyActorId}
        initial={{ events: pricingEvents }}
        onChanged={() => router.refresh()}
      />
      <CopyRewriteDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        apifyActorId={apifyActorId}
        onChanged={() => router.refresh()}
      />
      <Dialog open={categoryFeedbackOpen} onOpenChange={setCategoryFeedbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suggest a category correction</DialogTitle>
            <DialogDescription>
              Apify assigns Store categories automatically. Explain what should change and why; this
              sends feedback to Apify without overwriting the Actor metadata.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={categoryFeedback}
            onChange={(event) => setCategoryFeedback(event.target.value)}
            maxLength={2_000}
            placeholder="For example: This Actor extracts e-commerce product data and should be grouped under E-commerce rather than Social media."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryFeedbackOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="signal"
              disabled={submittingCategoryFeedback || categoryFeedback.trim().length < 10}
              onClick={() => void submitCategoryFeedback()}
            >
              {submittingCategoryFeedback ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Send feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ActionRow({
  icon: Icon,
  title,
  description,
  onClick,
  loading = false,
  badge = "Generate",
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  onClick: () => void;
  loading?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="border-border/40 bg-background hover:border-signal-orange/40 hover:bg-accent group flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors"
    >
      <div className="bg-signal-orange/10 text-signal-orange mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium">{title}</p>
          <Badge variant="outline" className="opacity-0 transition-opacity group-hover:opacity-100">
            {badge}
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
    </button>
  );
}
