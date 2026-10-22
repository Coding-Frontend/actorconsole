"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DollarSign, Loader2, Plus, Radar, Trash2 } from "lucide-react";

interface EventConfig {
  eventPriceUsd?: number;
  eventTitle?: string;
  eventDescription?: string;
  isOneTimeEvent?: boolean;
  isPrimaryEvent?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  apifyActorId: string;
  initial: { events?: Record<string, EventConfig> } | null;
  onChanged?: () => void;
}

export interface PricingEventDraft {
  id: string;
  name: string;
  price: string;
  title: string;
  description: string;
  isOneTimeEvent: boolean;
  isPrimaryEvent: boolean;
}

const API_BASE = API_BASE_URL;
const EVENT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

function draftId(index: number, name: string) {
  return `${index}-${name || "event"}`;
}

export function pricingEventDrafts(events: Record<string, EventConfig> = {}): PricingEventDraft[] {
  const drafts = Object.entries(events).map(([name, config], index) => ({
    id: draftId(index, name),
    name,
    price: config.eventPriceUsd == null ? "" : String(config.eventPriceUsd),
    title: config.eventTitle ?? "",
    description: config.eventDescription ?? "",
    isOneTimeEvent: Boolean(config.isOneTimeEvent),
    isPrimaryEvent: Boolean(config.isPrimaryEvent),
  }));
  return drafts.length
    ? drafts
    : [
        {
          id: draftId(0, "apify-default-dataset-item"),
          name: "apify-default-dataset-item",
          price: "0.001",
          title: "Result",
          description: "Charged for each result successfully saved to the dataset.",
          isOneTimeEvent: false,
          isPrimaryEvent: true,
        },
      ];
}

export function pricingEventsPayload(drafts: PricingEventDraft[]): Record<string, EventConfig> {
  return Object.fromEntries(
    drafts.map((event) => [
      event.name.trim(),
      {
        eventPriceUsd: Number(event.price),
        eventTitle: event.title.trim(),
        ...(event.description.trim() ? { eventDescription: event.description.trim() } : {}),
        ...(event.isOneTimeEvent ? { isOneTimeEvent: true } : {}),
        ...(event.isPrimaryEvent ? { isPrimaryEvent: true } : {}),
      },
    ]),
  );
}

interface PricingRecommendation {
  recommendedAmount: number | null;
  marketMedian: number | null;
  pricedCompetitorCount: number;
  query: string;
  marketRange: { low: number | null; high: number | null };
  actorSignals: { users30Days: number | null; successRate30Days: number | null };
  ownerAnalytics: unknown | null;
}

export function PricingDialog({ open, onOpenChange, apifyActorId, initial, onChanged }: Props) {
  const encodedActorId = encodeURIComponent(apifyActorId);
  const [events, setEvents] = useState<PricingEventDraft[]>(() =>
    pricingEventDrafts(initial?.events),
  );
  const [reason, setReason] = useState("");
  const [saving, startSave] = useTransition();
  const [recommendation, setRecommendation] = useState<PricingRecommendation | null>(null);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEvents(pricingEventDrafts(initial?.events));
    setReason("");
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    setLoadingRecommendation(true);
    fetch(`${API_BASE}/actors/${encodedActorId}/pricing/recommendation`, { credentials: "include" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
        setRecommendation(body.data ?? null);
      })
      .catch(() => setRecommendation(null))
      .finally(() => setLoadingRecommendation(false));
  }, [open, encodedActorId]);

  function updateEvent(id: string, patch: Partial<PricingEventDraft>) {
    setEvents((current) =>
      current.map((event) => {
        if (event.id !== id)
          return patch.isPrimaryEvent ? { ...event, isPrimaryEvent: false } : event;
        return { ...event, ...patch };
      }),
    );
  }

  function addEvent() {
    setEvents((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        name: "",
        price: "",
        title: "",
        description: "",
        isOneTimeEvent: false,
        isPrimaryEvent: false,
      },
    ]);
  }

  function validationError() {
    if (!events.length) return "Add at least one charge event";
    const names = events.map((event) => event.name.trim());
    if (names.some((name) => !EVENT_NAME_PATTERN.test(name))) {
      return "Event names must start with a letter and use only letters, numbers, dashes, or underscores";
    }
    if (new Set(names).size !== names.length) return "Every charge event needs a unique name";
    if (events.some((event) => !event.title.trim())) return "Every charge event needs a title";
    if (
      events.some(
        (event) =>
          event.price.trim() === "" ||
          !Number.isFinite(Number(event.price)) ||
          Number(event.price) < 0,
      )
    ) {
      return "Every charge event needs a non-negative USD price";
    }
    return null;
  }

  function save() {
    const error = validationError();
    if (error) {
      toast.error(error);
      return;
    }
    startSave(async () => {
      try {
        const response = await fetch(`${API_BASE}/actors/${encodedActorId}/pricing`, {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pricing: { model: "PAY_PER_EVENT", amount: null, events: pricingEventsPayload(events) },
            reason: reason.trim() || undefined,
          }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
        toast.success(
          body?.data?.changed === false
            ? "This pay-per-event configuration is already scheduled"
            : "Pay-per-event pricing scheduled on Apify",
        );
        onChanged?.();
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update pricing");
      }
    });
  }

  function applyMarketMedian() {
    if (recommendation?.recommendedAmount == null) return;
    const target = events.find((event) => event.isPrimaryEvent) ?? events[0];
    if (!target) return;
    updateEvent(target.id, { price: recommendation.recommendedAmount.toFixed(6) });
    setReason("Aligned the primary charge event with the live Store market median");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="text-signal-orange h-5 w-5" /> Update pay-per-event pricing
          </DialogTitle>
          <DialogDescription>
            Configure all Actor.charge events in one future pricing period. Apify keeps existing
            periods intact and activates the new period after its required notice window.
          </DialogDescription>
        </DialogHeader>

        <div className="border-border/60 bg-muted/20 rounded-md border p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Radar className="text-signal-orange h-4 w-4" /> Live market comparison
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {loadingRecommendation
                  ? "Checking comparable Store listings…"
                  : recommendation
                    ? `${recommendation.pricedCompetitorCount} priced competitors for “${recommendation.query}”.${recommendation.marketMedian == null ? " No comparable paid prices were found." : ` Median primary event: $${recommendation.marketMedian.toFixed(6)}.`}`
                    : "Market data is unavailable right now."}
              </p>
            </div>
            {recommendation?.recommendedAmount != null ? (
              <Button type="button" variant="outline" size="sm" onClick={applyMarketMedian}>
                Apply median to primary event
              </Button>
            ) : null}
          </div>
          {recommendation ? (
            <div className="border-border/60 mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs sm:grid-cols-4">
              <Signal
                label="30-day users"
                value={recommendation.actorSignals.users30Days?.toLocaleString() ?? "Unavailable"}
              />
              <Signal
                label="30-day success"
                value={
                  recommendation.actorSignals.successRate30Days == null
                    ? "Unavailable"
                    : `${recommendation.actorSignals.successRate30Days}%`
                }
              />
              <Signal
                label="Market range"
                value={
                  recommendation.marketRange.low == null || recommendation.marketRange.high == null
                    ? "Unavailable"
                    : `$${recommendation.marketRange.low.toFixed(6)}–$${recommendation.marketRange.high.toFixed(6)}`
                }
              />
              <Signal
                label="Owner analytics"
                value={recommendation.ownerAnalytics ? "Connected" : "Unavailable"}
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Charge events</p>
              <p className="text-muted-foreground text-xs">
                Add result, enriched-result, Actor-start, or other events used by Actor.charge().
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addEvent}>
              <Plus className="h-4 w-4" /> Add event
            </Button>
          </div>

          {events.map((event, index) => (
            <div key={event.id} className="border-border/60 bg-muted/10 rounded-lg border p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">Event {index + 1}</p>
                  {event.isPrimaryEvent ? <Badge variant="success">Primary</Badge> : null}
                  {event.isOneTimeEvent ? <Badge variant="outline">One time</Badge> : null}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove event ${index + 1}`}
                  disabled={events.length === 1}
                  onClick={() =>
                    setEvents((current) => current.filter((item) => item.id !== event.id))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={`${event.id}-name`} label="Event name">
                  <Input
                    id={`${event.id}-name`}
                    value={event.name}
                    onChange={(change) => updateEvent(event.id, { name: change.target.value })}
                    placeholder="apify-default-dataset-item"
                  />
                </Field>
                <Field id={`${event.id}-price`} label="Price per event (USD)">
                  <Input
                    id={`${event.id}-price`}
                    type="number"
                    min="0"
                    step="0.000001"
                    value={event.price}
                    onChange={(change) => updateEvent(event.id, { price: change.target.value })}
                    placeholder="0.001"
                  />
                </Field>
                <Field
                  id={`${event.id}-title`}
                  label="Customer-facing title"
                  className="sm:col-span-2"
                >
                  <Input
                    id={`${event.id}-title`}
                    value={event.title}
                    onChange={(change) => updateEvent(event.id, { title: change.target.value })}
                    placeholder="Search result"
                  />
                </Field>
                <Field
                  id={`${event.id}-description`}
                  label="Description (optional)"
                  className="sm:col-span-2"
                >
                  <Input
                    id={`${event.id}-description`}
                    value={event.description}
                    onChange={(change) =>
                      updateEvent(event.id, { description: change.target.value })
                    }
                    placeholder="Charged for each result successfully saved to the dataset"
                  />
                </Field>
              </div>
              <div className="border-border/60 mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                <ToggleRow
                  label="Primary Store event"
                  description="Used as the listing's headline event price."
                  checked={event.isPrimaryEvent}
                  onCheckedChange={(checked) => updateEvent(event.id, { isPrimaryEvent: checked })}
                />
                <ToggleRow
                  label="One-time event"
                  description="Charged only once during an Actor run."
                  checked={event.isOneTimeEvent}
                  onCheckedChange={(checked) => updateEvent(event.id, { isOneTimeEvent: checked })}
                />
              </div>
            </div>
          ))}
        </div>

        <Field id="pricing-reason" label="Reason for change (optional)">
          <Input
            id="pricing-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. added an enriched-result event"
          />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} variant="gradient">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Scheduling…
              </>
            ) : (
              "Schedule pricing update"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value}</p>
    </div>
  );
}
