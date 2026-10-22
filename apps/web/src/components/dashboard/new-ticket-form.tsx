"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const apiBase = API_BASE_URL;

type ActorOption = {
  id: string;
  apifyActorId: string;
  title: string | null;
  actorName: string;
};

const EMPTY_ACTORS: ActorOption[] = [];

const CATEGORIES = [
  { value: "BILLING", label: "Billing" },
  { value: "TECHNICAL", label: "Technical" },
  { value: "ACCOUNT", label: "Account" },
  { value: "FEATURE_REQUEST", label: "Feature request" },
  { value: "OTHER", label: "Other" },
];

const PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export function NewTicketForm({
  initialSubject = "",
  initialCategory = "TECHNICAL",
  initialBody = "",
  initialActorId = "",
  actors = EMPTY_ACTORS,
}: {
  initialSubject?: string;
  initialCategory?: string;
  initialBody?: string;
  initialActorId?: string;
  actors?: ActorOption[];
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(initialSubject);
  const [category, setCategory] = useState(initialCategory);
  const [priority, setPriority] = useState("NORMAL");
  const [body, setBody] = useState(initialBody);
  const [actorId, setActorId] = useState(initialActorId);
  const [actorQuery, setActorQuery] = useState("");
  const [actorOptions, setActorOptions] = useState(actors);
  const [actorsLoading, setActorsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const query = actorQuery.trim();
    if (query.length < 2) {
      setActorOptions(actors);
      setActorsLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setActorsLoading(true);
      try {
        const response = await fetch(
          `${apiBase}/actors?format=page&status=all&page=1&limit=20&q=${encodeURIComponent(query)}`,
          { credentials: "include", cache: "no-store", signal: controller.signal },
        );
        const body = await response.json().catch(() => null);
        if (response.ok && body?.ok) setActorOptions(body.data?.items ?? []);
        else setActorOptions([]);
      } catch {
        if (!controller.signal.aborted) setActorOptions([]);
      } finally {
        if (!controller.signal.aborted) setActorsLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [actorQuery, actors]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const r = await fetch(`${apiBase}/tickets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject,
          category,
          priority,
          body,
          ...(actorId ? { actorId } : {}),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j?.error?.message ?? `Failed (${r.status})`);
        return;
      }
      const j = await r.json();
      startTransition(() => {
        router.push(`/dashboard/support/${j.data.id}`);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the ticket. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What can we help with?</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Your current workspace is attached automatically. Add the Actor below if this issue
            affects one.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="ticket-actor" className="text-sm font-medium">
              Related Actor <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              id="ticket-actor-search"
              value={actorQuery}
              onChange={(event) => setActorQuery(event.target.value)}
              placeholder="Search by Actor name or Apify ID"
              className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            />
            <select
              id="ticket-actor"
              value={actorId}
              onChange={(event) => setActorId(event.target.value)}
              className="border-input bg-background focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            >
              <option value="">General workspace issue</option>
              {actorOptions.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.title ?? actor.actorName} · {actor.apifyActorId}
                </option>
              ))}
            </select>
            {actorsLoading ? (
              <p className="text-muted-foreground text-xs">Searching Actors…</p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Linking an Actor adds its current status and identity to support notifications.
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ticket-subject" className="text-sm font-medium">
              Subject
            </label>
            <input
              id="ticket-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              minLength={3}
              maxLength={200}
              placeholder="e.g. My publishing job is stuck on 'queued'"
              className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="ticket-category" className="text-sm font-medium">
                Category
              </label>
              <select
                id="ticket-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ticket-priority" className="text-sm font-medium">
                Priority
              </label>
              <select
                id="ticket-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ticket-description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="ticket-description"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              minLength={1}
              maxLength={10000}
              rows={8}
              placeholder="What happened? Steps to reproduce, expected vs actual, etc."
              className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            />
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Open ticket
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
