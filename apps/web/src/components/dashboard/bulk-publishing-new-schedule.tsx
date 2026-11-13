"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-base";
import { trackEvent } from "@/lib/analytics-events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkPublishingHeader } from "@/components/dashboard/bulk-publishing-header";
import {
  type ActorItem,
  isPrivateActor,
  loadPublishingSelection,
  savePublishingSelection,
} from "@/components/dashboard/bulk-publishing-types";
import { AdvancedSettings } from "@/components/dashboard/dashboard-workbench";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { useWorkspaceAccess } from "@/components/dashboard/workspace-access-context";

const CRON_PRESETS = [
  { value: "0 2 * * *", label: "02:00 UTC" },
  { value: "0 6 * * *", label: "06:00 UTC" },
  { value: "0 12 * * *", label: "12:00 UTC" },
  { value: "0 18 * * *", label: "18:00 UTC" },
  { value: "custom", label: "Custom cron" },
];

const DAILY_LIMITS = [1, 3, 5, 10];

function actorState(actor: ActorItem) {
  if (actor.storeIsDeprecated) return "Deprecated";
  if (actor.storeNotice === "UNDER_MAINTENANCE") return "Maintenance";
  if (actor.storeIsPublic === true) return "Published";
  if (actor.storeIsPublic === false) return "Private";
  return "Status unavailable";
}

function localStartPreview(cronExpr: string) {
  const match = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(cronExpr);
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (minute > 59 || hour > 23) return null;
  const next = new Date();
  next.setUTCHours(hour, minute, 0, 0);
  if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(next);
}

export function BulkPublishingNewSchedule() {
  const router = useRouter();
  const { access } = useWorkspaceAccess();
  const workspaceId = access?.workspaceId ?? null;
  const [selection, setSelection] = useState<{ workspaceId: string | null; actors: ActorItem[] }>({
    workspaceId: null,
    actors: [],
  });
  const actors = selection.workspaceId === workspaceId ? selection.actors : [];
  const setActors = (next: ActorItem[] | ((current: ActorItem[]) => ActorItem[])) =>
    setSelection((old) => ({
      workspaceId,
      actors:
        typeof next === "function" ? next(old.workspaceId === workspaceId ? old.actors : []) : next,
    }));
  const [inventory, setInventory] = useState<ActorItem[]>([]);
  const [name, setName] = useState("Daily Actor publishing");
  const [dailyLimit, setDailyLimit] = useState("5");
  const [preset, setPreset] = useState("0 2 * * *");
  const [customCron, setCustomCron] = useState("0 2 * * *");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingActors, setLoadingActors] = useState(true);
  const [refreshingActors, setRefreshingActors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [startActive, setStartActive] = useState(true);
  const initialRefreshAttempted = useRef(false);
  const inventoryRequest = useRef(0);
  const [localStart, setLocalStart] = useState<string | null>(null);

  useEffect(() => {
    setSelection({
      workspaceId,
      actors: loadPublishingSelection(workspaceId).filter(isPrivateActor),
    });
    initialRefreshAttempted.current = false;
    setInventory([]);
    setTotal(0);
    setPage(1);
    return () => {
      inventoryRequest.current += 1;
    };
  }, [workspaceId]);
  useEffect(() => {
    if (selection.workspaceId === workspaceId)
      savePublishingSelection(selection.actors, workspaceId);
  }, [selection, workspaceId]);

  const loadInventory = useCallback(
    async (refresh = false, silent = false) => {
      if (!workspaceId) {
        setLoadingActors(false);
        return;
      }
      const version = ++inventoryRequest.current;
      if (refresh) setRefreshingActors(true);
      else setLoadingActors(true);
      try {
        const params = new URLSearchParams({ status: "private", page: String(page), limit: "10" });
        if (query) params.set("q", query);
        if (refresh) params.set("refresh", "1");
        const response = await fetch(`${API_BASE_URL}/bulk-publishing/inventory?${params}`, {
          credentials: "include",
          cache: "no-store",
        });
        const body = await response.json().catch(() => null);
        if (version !== inventoryRequest.current) return;
        if (!response.ok || !body?.ok) {
          throw new Error(body?.error?.message ?? "Could not load Actors");
        }
        setInventory((body.data.items ?? []).filter(isPrivateActor));
        setTotal(body.data.total ?? 0);
      } catch (error) {
        if (!silent && version === inventoryRequest.current)
          toast.error(error instanceof Error ? error.message : "Could not load Actors");
      } finally {
        if (version === inventoryRequest.current) {
          setLoadingActors(false);
          setRefreshingActors(false);
        }
      }
    },
    [page, query, workspaceId],
  );

  useEffect(() => void loadInventory(), [loadInventory]);
  useEffect(() => {
    if (loadingActors || refreshingActors || initialRefreshAttempted.current) return;
    initialRefreshAttempted.current = true;
    void loadInventory(true, true);
  }, [loadInventory, loadingActors, refreshingActors]);

  const selectedIds = new Set(actors.map((actor) => actor.id));
  const cronExpr = preset === "custom" ? customCron.trim() : preset;
  useEffect(() => {
    setLocalStart(localStartPreview(cronExpr));
  }, [cronExpr]);
  const limit = Number(dailyLimit);
  const estimatedDays = Math.max(1, Math.ceil(actors.length / Math.max(1, limit || 1)));
  const valid = Boolean(
    name.trim() &&
    actors.length &&
    cronExpr &&
    Number.isInteger(limit) &&
    limit >= 1 &&
    limit <= 100,
  );
  const totalPages = Math.max(1, Math.ceil(total / 10));

  function searchActors(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(queryInput.trim());
  }

  function toggleActor(actor: ActorItem) {
    setActors((current) =>
      current.some((item) => item.id === actor.id)
        ? current.filter((item) => item.id !== actor.id)
        : [...current, actor],
    );
  }

  function moveActor(index: number, direction: -1 | 1) {
    setActors((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function createSchedule() {
    if (!valid) return;
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/bulk-publishing/schedules`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          actorIds: actors.map((actor) => actor.id),
          cronExpr,
          dailyLimit: limit,
          enabled: startActive,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? "Could not create publishing schedule");
      }
      void trackEvent("publishing_schedule_created", {
        actor_count: actors.length,
        enabled: startActive ? 1 : 0,
      });
      savePublishingSelection([], workspaceId);
      toast.success(
        startActive
          ? "Publishing schedule created and enabled"
          : "Publishing schedule saved as paused",
      );
      router.push("/dashboard/publishing/schedules");
      router.refresh();
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Could not create schedule");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <BulkPublishingHeader
        active="new"
        selectionCount={actors.length}
        onClearSelection={() => setActors([])}
      />

      <div className="border-signal-orange/35 bg-signal-orange/[0.06] flex items-start gap-3 rounded-sm border px-4 py-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-orange" />
        <p className="leading-6 text-muted-foreground">
          Publishing schedules require a healthy Apify API key that can manage the selected Actors.
          Console UI tokens and cookies provide metadata/category access but cannot publish by
          themselves.{" "}
          <Link href="/dashboard/apify" className="font-medium text-signal-blue hover:underline">
            Check the Apify connection
          </Link>
          .
        </p>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <section className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
            <div className="flex items-start gap-4 border-b border-border p-5 sm:p-6">
              <span className="bg-signal-orange/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm font-mono text-xs font-bold text-signal-orange">
                01
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display-tight text-2xl">Choose the publishing queue</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select Actors here or keep the selection you made in Inventory.
                </p>
              </div>
            </div>

            <form
              onSubmit={searchActors}
              className="grid gap-3 border-b border-border p-4 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:p-5"
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  className="pl-9"
                  placeholder="Search Actors"
                  aria-label="Search Actors"
                />
              </div>
              <div
                className="flex h-10 items-center gap-2 rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground"
                aria-label="Actor status filter"
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-signal-green" />
                Private Actors only
              </div>
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>

            {loadingActors ? (
              <div className="space-y-px bg-border">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-[68px] w-full rounded-none" />
                ))}
              </div>
            ) : inventory.length ? (
              <div className="divide-y divide-border">
                {inventory.map((actor) => {
                  const selected = selectedIds.has(actor.id);
                  return (
                    <button
                      key={actor.id}
                      type="button"
                      onClick={() => toggleActor(actor)}
                      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors sm:px-5 ${
                        selected ? "bg-signal-blue/[0.06]" : "hover:bg-muted/25"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${
                          selected
                            ? "border-signal-blue bg-signal-blue text-white"
                            : "border-border bg-card"
                        }`}
                      >
                        {selected ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {actor.title ?? actor.actorName}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
                          {actor.username}/{actor.actorName}
                        </span>
                      </span>
                      <Badge variant="outline" className="shrink-0 text-muted-foreground">
                        {actorState(actor)}
                      </Badge>
                      <span className="hidden items-center gap-1 text-xs font-medium text-signal-blue sm:flex">
                        {selected ? "Selected" : "Add"}
                        {!selected ? <Plus className="h-3.5 w-3.5" /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-6 py-12 text-center">
                <p className="font-medium">No Actors match this view</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try another search or refresh your inventory.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border px-4 py-3 sm:px-5">
              <p className="text-xs text-muted-foreground">
                {total ? `${total} matching Actors` : "No matching Actors"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  aria-label="Previous Actor page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  aria-label="Next Actor page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
            <div className="flex items-start gap-4 border-b border-border p-5 sm:p-6">
              <span className="bg-signal-orange/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm font-mono text-xs font-bold text-signal-orange">
                02
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display-tight text-2xl">Set the daily run</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose when publishing runs. You can start it now or leave it paused.
                </p>
              </div>
            </div>
            <div className="space-y-6 p-5 sm:p-6">
              <div className="space-y-2">
                <Label htmlFor="schedule-name">Schedule name</Label>
                <Input
                  id="schedule-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Store publishing queue"
                />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <Label>Daily publish limit</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Maximum Actors attempted each day.
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {DAILY_LIMITS.map((value) => (
                      <Button
                        key={value}
                        type="button"
                        variant={dailyLimit === String(value) ? "secondary" : "outline"}
                        onClick={() => setDailyLimit(String(value))}
                      >
                        {value}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label>Daily start time</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Times are saved in UTC. Your local time appears in the review.
                    </p>
                  </div>
                  <Select value={preset} onValueChange={setPreset}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CRON_PRESETS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <AdvancedSettings
                title="Advanced schedule controls"
                description="Use a custom daily capacity or UTC cron expression."
                defaultOpen={preset === "custom" || !DAILY_LIMITS.includes(limit)}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="daily-limit">Custom daily limit</Label>
                    <Input
                      id="daily-limit"
                      type="number"
                      min={1}
                      max={100}
                      value={dailyLimit}
                      onChange={(event) => setDailyLimit(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custom-cron">Custom cron expression</Label>
                    <Input
                      id="custom-cron"
                      value={customCron}
                      onFocus={() => setPreset("custom")}
                      onChange={(event) => {
                        setPreset("custom");
                        setCustomCron(event.target.value);
                      }}
                      className="font-mono"
                      aria-label="Custom cron expression in UTC"
                    />
                  </div>
                </div>
              </AdvancedSettings>
              <div className="border-signal-green/25 bg-signal-green/[0.045] flex items-start gap-3 rounded-sm border px-4 py-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-signal-green" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  If Apify reports its 24-hour publication limit, this run stops and the remaining
                  Actors stay queued for the next scheduled day.
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-5 xl:sticky xl:top-6 xl:self-start">
          <section className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <div>
                <p className="text-sm font-semibold">Publishing order</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {actors.length
                    ? `${actors.length} Actor${actors.length === 1 ? "" : "s"} selected`
                    : "Select at least one Actor"}
                </p>
              </div>
              <Badge variant="outline" className="text-signal-blue">
                {actors.length}
              </Badge>
            </div>
            {actors.length ? (
              <div className="max-h-[420px] divide-y overflow-y-auto">
                {actors.map((actor, index) => (
                  <div key={actor.id} className="group flex items-center gap-2 px-3 py-3">
                    <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {actor.title ?? actor.actorName}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                        {actor.username}/{actor.actorName}
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => moveActor(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${actor.title ?? actor.actorName} up`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => moveActor(index, 1)}
                        disabled={index === actors.length - 1}
                        aria-label={`Move ${actor.title ?? actor.actorName} down`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => toggleActor(actor)}
                        aria-label={`Remove ${actor.title ?? actor.actorName}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-10 text-center">
                <Plus className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">
                  Add Actors from the list on the left.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-md border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Review your schedule</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Starts</span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Clock3 className="h-3.5 w-3.5 text-signal-blue" />{" "}
                  {localStart ?? "Custom UTC schedule"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Saved time</span>
                <span className="font-medium">{cronExpr || "Invalid"} (UTC)</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Each day</span>
                <span className="font-medium">
                  Up to {Number.isFinite(limit) ? limit : 0} Actors
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Estimated queue</span>
                <span className="font-medium">
                  {actors.length ? `${estimatedDays} day${estimatedDays === 1 ? "" : "s"}` : "—"}
                </span>
              </div>
            </div>
            <div className="mt-5 flex items-start gap-3 border-t border-border pt-4 text-sm">
              <input
                id="schedule-start-active"
                type="checkbox"
                checked={startActive}
                onChange={(event) => setStartActive(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-signal-blue"
              />
              <div>
                <label htmlFor="schedule-start-active" className="block cursor-pointer font-medium">
                  Start automatically after creation
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Turn this off to review the schedule in a paused state first.
                </p>
              </div>
            </div>
            <Button
              className="mt-5 w-full"
              size="lg"
              variant="signal"
              onClick={() => setReviewOpen(true)}
              loading={submitting}
              loadingText="Creating schedule"
              disabled={!submitting && !valid}
            >
              <CalendarClock className="h-4 w-4" />
              Review and create
            </Button>
            {!actors.length ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Select at least one Actor to continue.
              </p>
            ) : null}
          </section>
        </aside>
      </div>
      <ConfirmDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        title="Create publishing schedule?"
        description={`${actors.length} Actor${actors.length === 1 ? "" : "s"} selected · up to ${limit} per day · ${localStart ?? `${cronExpr} UTC`} · ${startActive ? "starts active" : "starts paused"}.`}
        confirmLabel={startActive ? "Create and start" : "Create paused"}
        onConfirm={createSchedule}
      />
    </div>
  );
}
