"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-base";
import { useSessionDraft } from "@/lib/use-session-draft";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { DashboardAsyncState } from "./dashboard-workbench";
import { useWorkspaceAccess } from "./workspace-access-context";

type ActorOption = { id: string; apifyActorId: string; title: string | null; actorName: string };
type TicketDraft = {
  subject: string;
  category: string;
  priority: string;
  body: string;
  actorId: string;
  actor: ActorOption | null;
};
const EMPTY_ACTORS: ActorOption[] = [];
const categories = [
  ["BILLING", "Billing"],
  ["TECHNICAL", "Technical"],
  ["ACCOUNT", "Account"],
  ["FEATURE_REQUEST", "Feature request"],
  ["OTHER", "Other"],
];
const priorities = [
  ["LOW", "Low"],
  ["NORMAL", "Normal"],
  ["HIGH", "High"],
  ["URGENT", "Urgent"],
];
const fieldClass =
  "border-input bg-background focus:ring-ring min-h-11 w-full min-w-0 rounded-md border px-3 py-2 text-base focus:outline-none focus:ring-2";
function validDraft(value: unknown): value is TicketDraft {
  if (!value || typeof value !== "object") return false;
  const item = value as TicketDraft;
  return (
    typeof item.subject === "string" &&
    item.subject.length <= 200 &&
    typeof item.body === "string" &&
    item.body.length <= 10000 &&
    categories.some(([key]) => key === item.category) &&
    priorities.some(([key]) => key === item.priority) &&
    typeof item.actorId === "string" &&
    (item.actor === null ||
      Boolean(
        item.actor &&
        typeof item.actor.id === "string" &&
        typeof item.actor.apifyActorId === "string" &&
        typeof item.actor.actorName === "string" &&
        (item.actor.title === null || typeof item.actor.title === "string"),
      ))
  );
}

export function NewTicketForm({
  userId,
  initialSubject = "",
  initialCategory = "TECHNICAL",
  initialBody = "",
  initialActorId = "",
  actors = EMPTY_ACTORS,
}: {
  userId: string;
  initialSubject?: string;
  initialCategory?: string;
  initialBody?: string;
  initialActorId?: string;
  actors?: ActorOption[];
}) {
  const router = useRouter();
  const workspace = useWorkspaceAccess();
  const workspaceId = workspace.access?.workspaceId;
  const key = workspaceId ? `actorconsole:support-draft:${userId}:${workspaceId}` : null;
  const initial: TicketDraft = {
    subject: initialSubject,
    category: initialCategory,
    priority: "NORMAL",
    body: initialBody,
    actorId: initialActorId,
    actor: actors.find((item) => item.id === initialActorId) ?? null,
  };
  const draft = useSessionDraft(key, initial, validDraft);
  const { subject, category, priority, body, actorId } = draft.value;
  const [actorQuery, setActorQuery] = useState("");
  const [actorOptions, setActorOptions] = useState(actors);
  const [actorsLoading, setActorsLoading] = useState(false);
  const [actorError, setActorError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [, startTransition] = useTransition();
  const pending = useRef(false);
  const options = [
    ...new Map(
      [...(draft.value.actor ? [draft.value.actor] : []), ...actorOptions].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ];
  function change<K extends keyof TicketDraft>(field: K, value: TicketDraft[K]) {
    draft.setValue((previous) => ({ ...previous, [field]: value }));
    setError(null);
  }

  useEffect(() => {
    const query = actorQuery.trim();
    if (query.length < 2 || !workspaceId) {
      setActorOptions(actors);
      setActorsLoading(false);
      setActorError(null);
      return;
    }
    const controller = new AbortController();
    setActorsLoading(true);
    setActorError(null);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/actors?format=page&status=all&page=1&limit=20&q=${encodeURIComponent(query)}`,
          {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
            headers: { "x-business-profile-id": workspaceId },
          },
        );
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok)
          throw new Error("Actor search could not be loaded. Try searching again.");
        if (!controller.signal.aborted)
          setActorOptions(
            (result.data?.items ?? []).map((item: ActorOption) => ({
              id: item.id,
              apifyActorId: item.apifyActorId,
              title: item.title,
              actorName: item.actorName,
            })),
          );
      } catch (failure) {
        if (!controller.signal.aborted) {
          setActorOptions([]);
          setActorError(
            failure instanceof Error ? failure.message : "Actor search is unavailable. Try again.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setActorsLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [actorQuery, actors, workspaceId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !draft.ready || !workspaceId) return;
    pending.current = true;
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/tickets`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-business-profile-id": workspaceId },
        credentials: "include",
        body: JSON.stringify({
          subject,
          category,
          priority,
          body,
          ...(actorId ? { actorId } : {}),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok || !result.data?.id)
        throw new Error(
          result?.error?.message ??
            "The ticket could not be opened. Your draft is kept; please try again.",
        );
      draft.clear();
      startTransition(() => router.push(`/dashboard/support/${result.data.id}`));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not open the ticket. Your draft is kept; please try again.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What can we help with?</CardTitle>
      </CardHeader>
      <CardContent>
        {!key ? (
          <DashboardAsyncState
            status={workspace.error || (!workspace.loading && !workspaceId) ? "error" : "loading"}
            title="Confirming your workspace"
            description="Select a workspace before opening a support ticket."
            onRetry={workspace.refresh}
          />
        ) : null}
        <form onSubmit={submit} className="space-y-4">
          {draft.ready && (draft.dirty || draft.restored) ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
              <p role="status">
                {draft.storageAvailable
                  ? draft.restored
                    ? "Your saved draft was restored in this tab."
                    : "Draft saved in this tab for this workspace."
                  : "Draft saving is unavailable in this browser. Copy your text before leaving this page."}
              </p>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={saving}
                onClick={() => setDiscardOpen(true)}
              >
                Discard draft
              </Button>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Your current workspace is attached automatically. Add the Actor below if this issue
            affects one.
          </p>
          <fieldset disabled={saving || !draft.ready} className="min-w-0 space-y-4">
            <div className="space-y-2">
              <label htmlFor="ticket-actor-search" className="block text-sm font-medium">
                Search Actors <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                id="ticket-actor-search"
                value={actorQuery}
                onChange={(event) => setActorQuery(event.target.value)}
                placeholder="Actor name or Apify ID"
                aria-describedby="ticket-actor-help"
                className={fieldClass}
              />
              <label htmlFor="ticket-actor" className="block text-sm font-medium">
                Related Actor <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <select
                id="ticket-actor"
                value={actorId}
                onChange={(event) => {
                  const actor = options.find((item) => item.id === event.target.value) ?? null;
                  draft.setValue((previous) => ({ ...previous, actorId: actor?.id ?? "", actor }));
                }}
                className={fieldClass}
              >
                <option value="">General workspace issue</option>
                {options.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.title ?? actor.actorName} · {actor.apifyActorId}
                  </option>
                ))}
              </select>
              <p id="ticket-actor-help" className="text-xs text-muted-foreground">
                Linking an Actor adds its current status and identity to support notifications.
              </p>
              {actorsLoading ? (
                <p role="status" className="text-xs text-muted-foreground">
                  Searching Actors…
                </p>
              ) : actorError ? (
                <p role="alert" className="text-sm text-destructive">
                  {actorError}
                </p>
              ) : actorQuery.trim().length >= 2 && actorOptions.length === 0 ? (
                <p role="status" className="text-xs text-muted-foreground">
                  No Actors match this search.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label htmlFor="ticket-subject" className="block text-sm font-medium">
                Subject
              </label>
              <input
                id="ticket-subject"
                value={subject}
                onChange={(event) => change("subject", event.target.value)}
                required
                minLength={3}
                maxLength={200}
                placeholder="What do you need help with?"
                className={fieldClass}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="ticket-category" className="block text-sm font-medium">
                  Category
                </label>
                <select
                  id="ticket-category"
                  value={category}
                  onChange={(event) => change("category", event.target.value)}
                  className={fieldClass}
                >
                  {categories.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="ticket-priority" className="block text-sm font-medium">
                  Priority
                </label>
                <select
                  id="ticket-priority"
                  value={priority}
                  onChange={(event) => change("priority", event.target.value)}
                  className={fieldClass}
                >
                  {priorities.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="ticket-description" className="block text-sm font-medium">
                Description
              </label>
              <textarea
                id="ticket-description"
                value={body}
                onChange={(event) => change("body", event.target.value)}
                required
                minLength={1}
                maxLength={10000}
                rows={8}
                placeholder="What happened, and what did you expect?"
                className={fieldClass}
              />
            </div>
            {error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={saving || !draft.ready}
              className="min-h-11 w-full sm:w-auto"
            >
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {saving ? "Opening ticket…" : "Open ticket"}
            </Button>
          </fieldset>
        </form>
        <ConfirmDialog
          open={discardOpen}
          onOpenChange={setDiscardOpen}
          title="Discard this draft?"
          description="The subject, description and Actor selection in this draft will be cleared."
          confirmLabel="Discard draft"
          destructive
          onConfirm={draft.clear}
        />
      </CardContent>
    </Card>
  );
}
