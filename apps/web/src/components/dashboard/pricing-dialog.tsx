"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useEffect, useRef, useState } from "react";
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
  eventTieredPricingUsd?: Record<string, { tieredEventPriceUsd?: number }>;
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
  tiers?: Record<string, string>;
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
    ...(config.eventTieredPricingUsd
      ? {
          tiers: Object.fromEntries(
            Object.entries(config.eventTieredPricingUsd).map(([tier, entry]) => [
              tier,
              entry.tieredEventPriceUsd == null ? "" : String(entry.tieredEventPriceUsd),
            ]),
          ),
        }
      : {}),
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
        ...(event.tiers
          ? {
              eventTieredPricingUsd: Object.fromEntries(
                Object.entries(event.tiers).map(([tier, price]) => [
                  tier,
                  { tieredEventPriceUsd: Number(price) },
                ]),
              ),
            }
          : { eventPriceUsd: Number(event.price) }),
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
  competitors?: Array<{
    id: string;
    title: string | null;
    name: string;
    amount: number | null;
    url: string;
    unitName: string | null;
    eventName?: string | null;
    eventDescription?: string | null;
    pricingKind?: string;
  }>;
}

interface PricingPeriod {
  startedAt?: string;
  pricingModel?: string;
  pricingPerEvent?: { actorChargeEvents?: Record<string, EventConfig> };
}
interface PricingState {
  periods: PricingPeriod[];
  active: PricingPeriod | null;
  scheduled: PricingPeriod[];
  earliestStartsAt: string;
}
function dateTime(value?: string) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Not scheduled";
}
function eventSummary(event: EventConfig) {
  return event.eventTieredPricingUsd
    ? Object.entries(event.eventTieredPricingUsd)
        .map(([tier, entry]) => `${tier}: $${entry.tieredEventPriceUsd}`)
        .join(" · ")
    : `$${event.eventPriceUsd ?? 0} per event`;
}

export function PricingDialog({ open, onOpenChange, apifyActorId, initial, onChanged }: Props) {
  const encodedActorId = encodeURIComponent(apifyActorId);
  const [events, setEvents] = useState<PricingEventDraft[]>(() =>
    pricingEventDrafts(initial?.events),
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [pricingState, setPricingState] = useState<PricingState | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [saved, setSaved] = useState<{ startedAt?: string; changed: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const session = useRef(0);
  const writing = useRef(false);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const [recommendation, setRecommendation] = useState<PricingRecommendation | null>(null);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);

  useEffect(() => {
    const version = ++session.current;
    const controller = new AbortController();
    setEvents(pricingEventDrafts(initialRef.current?.events));
    setReason("");
    setReview(false);
    setSaved(null);
    setError(null);
    setPricingState(null);
    setRecommendation(null);
    setSaving(false);
    if (!open) return () => controller.abort();
    setLoadingPricing(true);
    void fetch(`${API_BASE}/actors/${encodedActorId}/pricing`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (controller.signal.aborted || session.current !== version) return;
        if (!response.ok || !Array.isArray(body.data?.periods))
          throw new Error(
            body.error?.message ??
              "Could not load current Apify pricing. Retry before scheduling changes.",
          );
        const state = body.data as PricingState;
        setPricingState(state);
        const latest = state.scheduled.at(-1) ?? state.active;
        if (latest?.pricingPerEvent?.actorChargeEvents)
          setEvents(pricingEventDrafts(latest.pricingPerEvent.actorChargeEvents));
      })
      .catch((err) => {
        if (!controller.signal.aborted && session.current === version)
          setError(err instanceof Error ? err.message : "Could not load pricing");
      })
      .finally(() => {
        if (!controller.signal.aborted && session.current === version) setLoadingPricing(false);
      });
    return () => {
      controller.abort();
      session.current += 1;
    };
  }, [open, encodedActorId, retry]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoadingRecommendation(true);
    fetch(`${API_BASE}/actors/${encodedActorId}/pricing/recommendation`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
        setRecommendation(body.data ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecommendation(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingRecommendation(false);
      });
    return () => controller.abort();
  }, [open, encodedActorId, retry]);

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
      events.some((event) =>
        (event.tiers ? Object.values(event.tiers) : [event.price]).some(
          (price) => price.trim() === "" || !Number.isFinite(Number(price)) || Number(price) < 0,
        ),
      )
    ) {
      return "Every charge event needs a non-negative USD price";
    }
    return null;
  }

  async function save() {
    if (writing.current || !pricingState) return;
    const error = validationError();
    if (error) {
      toast.error(error);
      return;
    }
    writing.current = true;
    setSaving(true);
    setError(null);
    const version = session.current;
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
      if (session.current !== version) return;
      if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      if (!body?.data?.startedAt || body.data.verified !== true)
        throw new Error(
          "Could not verify the scheduled pricing. Refresh and review before retrying.",
        );
      setSaved({ startedAt: body.data.startedAt, changed: body.data.changed !== false });
      toast.success(
        body?.data?.changed === false
          ? "This pay-per-event configuration is already scheduled"
          : "Pay-per-event pricing scheduled on Apify",
      );
      onChanged?.();
    } catch (error) {
      if (session.current === version) {
        const message = error instanceof Error ? error.message : "Failed to update pricing";
        setError(message);
        toast.error(message);
      }
    } finally {
      writing.current = false;
      if (session.current === version) setSaving(false);
    }
  }

  function applyMarketMedian() {
    if (recommendation?.recommendedAmount == null) return;
    const target = events.find((event) => event.isPrimaryEvent) ?? events[0];
    if (!target || target.tiers || target.isOneTimeEvent) return;
    updateEvent(target.id, { price: recommendation.recommendedAmount.toFixed(6) });
    setReason("Aligned the primary charge event with the live Store market median");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!writing.current) onOpenChange(next);
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:p-0"
        onEscapeKeyDown={(event) => {
          if (writing.current) event.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 border-b p-5 pr-14 sm:p-6 sm:pr-14">
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 shrink-0 text-signal-orange" />{" "}
            {saved
              ? "Pricing schedule verified"
              : review
                ? "Review pricing changes"
                : "Update pay-per-event pricing"}
          </DialogTitle>
          <DialogDescription>
            Configure all Actor.charge events in one future pricing period. Apify keeps existing
            periods intact and activates the new period after its required notice window.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
            >
              <p>{error}</p>
              <Button
                className="mt-2"
                variant="outline"
                disabled={saving}
                onClick={() => setRetry((old) => old + 1)}
              >
                {pricingState ? "Refresh pricing for review" : "Retry pricing check"}
              </Button>
            </div>
          ) : null}
          {loadingPricing ? (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading current Apify pricing…
            </p>
          ) : null}
          {saved ? (
            <div role="status" className="border-signal-green/30 space-y-3 rounded-md border p-4">
              <p className="font-semibold">
                {saved.changed
                  ? "New pricing period saved and verified on Apify."
                  : "This pricing configuration is already saved on Apify."}
              </p>
              <p>
                Effective from <strong>{dateTime(saved.startedAt)}</strong>. Current prices remain
                in effect until then.
              </p>
              <p className="text-sm text-muted-foreground">
                The Actor’s History tab records the new period and its activation date.
              </p>
            </div>
          ) : (
            <>
              {pricingState ? (
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <PricingPeriodCard title="Current on Apify" period={pricingState.active} />
                  <div className="space-y-3">
                    {pricingState.scheduled.length ? (
                      pricingState.scheduled.map((period, index) => (
                        <PricingPeriodCard
                          key={`${period.startedAt}-${index}`}
                          title="Already scheduled"
                          period={period}
                        />
                      ))
                    ) : (
                      <p className="rounded-md border p-3 text-sm text-muted-foreground">
                        No future pricing periods are scheduled.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      New changes take effect from approximately{" "}
                      {dateTime(pricingState.earliestStartsAt)}. The exact saved date is confirmed
                      after scheduling.
                    </p>
                  </div>
                </div>
              ) : null}
              {pricingState?.scheduled.length ? (
                <div role="status" className="space-y-2 rounded-md border p-4 text-sm">
                  <p className="font-semibold">A pricing change is already scheduled</p>
                  <p className="text-muted-foreground">
                    Apify accepts one future pricing period. You can make another change after the
                    scheduled prices take effect. Contact Apify support if you need to change or
                    cancel the pending period sooner.
                  </p>
                </div>
              ) : review ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Review all charge events below. Subscription tiers and existing billing settings
                    are preserved. This appends a future period.
                  </p>
                  {Object.entries(pricingEventsPayload(events)).map(([name, event]) => (
                    <div key={name} className="min-w-0 rounded-md border p-3">
                      <p className="break-all font-mono text-xs">{name}</p>
                      <p className="mt-1 font-medium">{event.eventTitle}</p>
                      <p className="mt-1 break-words text-sm">{eventSummary(event)}</p>
                      {event.isOneTimeEvent ? <Badge variant="outline">One time</Badge> : null}
                      {event.isPrimaryEvent ? <Badge variant="secondary">Primary</Badge> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <Radar className="h-4 w-4 text-signal-orange" /> Live market comparison
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingRecommendation
                            ? "Checking comparable Store listings…"
                            : recommendation
                              ? `${recommendation.pricedCompetitorCount} priced competitors for “${recommendation.query}”.${recommendation.marketMedian == null ? " No comparable paid prices were found." : ` Median primary event: $${recommendation.marketMedian.toFixed(6)}.`}`
                              : "Market data is unavailable right now."}
                        </p>
                      </div>
                      {recommendation?.recommendedAmount != null ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={Boolean(
                            (events.find((event) => event.isPrimaryEvent) ?? events[0])?.tiers ||
                            (events.find((event) => event.isPrimaryEvent) ?? events[0])
                              ?.isOneTimeEvent,
                          )}
                          onClick={applyMarketMedian}
                        >
                          Apply median to primary event
                        </Button>
                      ) : null}
                    </div>
                    {recommendation ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs sm:grid-cols-4">
                        <Signal
                          label="30-day users"
                          value={
                            recommendation.actorSignals.users30Days?.toLocaleString() ??
                            "Unavailable"
                          }
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
                            recommendation.marketRange.low == null ||
                            recommendation.marketRange.high == null
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
                    {recommendation?.competitors?.length ? (
                      <details className="mt-3 border-t pt-3">
                        <summary className="min-h-11 cursor-pointer text-sm font-medium">
                          Compare sources and event units
                        </summary>
                        <p className="mb-3 text-xs text-muted-foreground">
                          Compare what each event charges for before using the median. One-time
                          charges, tiered prices, and future periods are excluded from the
                          flat-price median.
                        </p>
                        <ul className="space-y-3">
                          {recommendation.competitors.map((competitor) => (
                            <li key={competitor.id} className="min-w-0 border-t pt-3 text-sm">
                              <a
                                href={competitor.url}
                                target="_blank"
                                rel="noreferrer"
                                className="break-words font-medium underline"
                              >
                                {competitor.title ?? competitor.name}
                              </a>
                              <p className="mt-1 break-words">
                                {competitor.amount == null
                                  ? "Excluded from flat-price comparison"
                                  : `$${competitor.amount} per ${competitor.unitName ?? "event"}`}
                              </p>
                              <p className="break-words text-xs text-muted-foreground">
                                {competitor.eventName}
                                {competitor.eventDescription
                                  ? ` · ${competitor.eventDescription}`
                                  : ""}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Charge events</p>
                        <p className="text-xs text-muted-foreground">
                          Add result, enriched-result, Actor-start, or other events used by
                          Actor.charge().
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addEvent}>
                        <Plus className="h-4 w-4" /> Add event
                      </Button>
                    </div>

                    {events.map((event, index) => (
                      <div
                        key={event.id}
                        className="rounded-lg border border-border/60 bg-muted/10 p-4"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">Event {index + 1}</p>
                            {event.isPrimaryEvent ? <Badge variant="success">Primary</Badge> : null}
                            {event.isOneTimeEvent ? (
                              <Badge variant="outline">One time</Badge>
                            ) : null}
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
                              onChange={(change) =>
                                updateEvent(event.id, { name: change.target.value })
                              }
                              placeholder="apify-default-dataset-item"
                            />
                          </Field>
                          {event.tiers ? (
                            <div className="space-y-3 sm:col-span-2">
                              <p className="text-sm font-medium">
                                Subscription tier prices (USD per event)
                              </p>
                              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                                {Object.entries(event.tiers).map(([tier, price]) => (
                                  <Field
                                    key={tier}
                                    id={`${event.id}-${tier}`}
                                    label={`${tier} price (USD)`}
                                  >
                                    <Input
                                      id={`${event.id}-${tier}`}
                                      type="number"
                                      min="0"
                                      step="0.000001"
                                      value={price}
                                      onChange={(change) =>
                                        updateEvent(event.id, {
                                          tiers: { ...event.tiers, [tier]: change.target.value },
                                        })
                                      }
                                    />
                                  </Field>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <Field id={`${event.id}-price`} label="Price per event (USD)">
                              <Input
                                id={`${event.id}-price`}
                                type="number"
                                min="0"
                                step="0.000001"
                                value={event.price}
                                onChange={(change) =>
                                  updateEvent(event.id, { price: change.target.value })
                                }
                                placeholder="0.001"
                              />
                            </Field>
                          )}
                          <Field
                            id={`${event.id}-title`}
                            label="Customer-facing title"
                            className="sm:col-span-2"
                          >
                            <Input
                              id={`${event.id}-title`}
                              value={event.title}
                              onChange={(change) =>
                                updateEvent(event.id, { title: change.target.value })
                              }
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
                        <div className="mt-4 grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
                          <ToggleRow
                            label="Primary Store event"
                            description="Used as the listing's headline event price."
                            checked={event.isPrimaryEvent}
                            onCheckedChange={(checked) =>
                              updateEvent(event.id, { isPrimaryEvent: checked })
                            }
                          />
                          <ToggleRow
                            label="One-time event"
                            description="Charged only once during an Actor run."
                            checked={event.isOneTimeEvent}
                            onCheckedChange={(checked) =>
                              updateEvent(event.id, { isOneTimeEvent: checked })
                            }
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
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t bg-card p-4 sm:p-5">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() =>
              saved ? onOpenChange(false) : review ? setReview(false) : onOpenChange(false)
            }
          >
            {saved ? "Done" : review ? "Back to editing" : "Cancel"}
          </Button>
          {!saved && !pricingState?.scheduled.length ? (
            <Button
              onClick={() => {
                if (review) void save();
                else {
                  const message = validationError();
                  setError(message);
                  if (!message) setReview(true);
                }
              }}
              disabled={saving || loadingPricing || !pricingState}
              variant="gradient"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Scheduling…
                </>
              ) : review ? (
                "Schedule pricing update"
              ) : (
                "Review pricing changes"
              )}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PricingPeriodCard({ title, period }: { title: string; period: PricingPeriod | null }) {
  return (
    <section className="min-w-0 rounded-md border p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {period ? `Effective ${dateTime(period.startedAt)}` : "No active pricing period"}
      </p>
      {Object.entries(period?.pricingPerEvent?.actorChargeEvents ?? {}).map(([name, event]) => (
        <div key={name} className="mt-3 min-w-0 text-xs">
          <p className="break-all font-mono">{name}</p>
          <p className="mt-1 break-words">{eventSummary(event)}</p>
        </div>
      ))}
    </section>
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
        <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value}</p>
    </div>
  );
}
