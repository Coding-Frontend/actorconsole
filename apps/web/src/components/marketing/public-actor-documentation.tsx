"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  Database,
  ExternalLink,
  FileText,
  History,
  LoaderCircle,
  MessageSquare,
  RefreshCcw,
  ScrollText,
  Star,
} from "lucide-react";
import { ApifyMarkdown } from "@/components/marketing/apify-markdown";
import { SchemaCodeView } from "@/components/marketing/schema-code-view";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Review = {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string | null;
  authorName: string | null;
  authorUsername: string | null;
  developerReply: string | null;
  developerReplyAt: string | null;
};

type Documentation = {
  readme: string | null;
  inputSchema: unknown;
  outputSchema: unknown;
  ratingBreakdown: Record<string, number> | null;
  rating: number | null;
  reviewCount: number | null;
  reviews: Review[];
  reviewError: string | null;
  sourceUrl: string;
};

export function PublicActorDocumentation({
  username,
  actorName,
  firstPublishedAt,
  createdAt,
  modifiedAt,
  firstSeenAt,
  detailsSyncedAt,
  lastSeenAt,
  apifyUrl,
  initialTab = "readme",
}: {
  username: string;
  actorName: string;
  firstPublishedAt: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  firstSeenAt: string | null;
  detailsSyncedAt: string | null;
  lastSeenAt: string | null;
  apifyUrl: string;
  initialTab?: "readme" | "input" | "output" | "changelog" | "reviews";
}) {
  const [state, setState] = useState<{ data: Documentation | null; error: string | null }>({
    data: null,
    error: null,
  });
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [reviews, setReviews] = useState<{
    data: Review[] | null;
    error: string | null;
  }>({ data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    void fetch(
      `/api/public/builders/${encodeURIComponent(username)}/actors/${encodeURIComponent(actorName)}/documentation`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = await readJsonResponse<Documentation & { error?: string }>(response);
        if (!response.ok) throw new Error(body.error ?? "Actor documentation could not be loaded");
        return body;
      })
      .then((data) => {
        if (!disposed) setState({ data, error: null });
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setState({
            data: null,
            error:
              (error as { name?: string }).name === "AbortError"
                ? "Public Actor documentation took too long to load."
                : error instanceof Error
                  ? error.message
                  : "Could not load docs",
          });
        }
      });
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [actorName, username]);

  useEffect(() => {
    if (activeTab !== "reviews" || reviews.data || reviews.error) return;
    if ((state.data?.reviewCount ?? 0) <= 0) {
      setReviews({ data: [], error: null });
      return;
    }
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    void fetch(
      `/api/public/builders/${encodeURIComponent(username)}/actors/${encodeURIComponent(actorName)}/reviews`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = await readJsonResponse<{
          reviews?: Review[];
          reviewError?: string;
          error?: string;
        }>(response);
        if (!response.ok) throw new Error(body.error ?? "Reviews could not be loaded");
        return body;
      })
      .then((data) => {
        if (!disposed) {
          setReviews({ data: data.reviews ?? [], error: data.reviewError ?? null });
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setReviews({
            data: [],
            error:
              (error as { name?: string }).name === "AbortError"
                ? "Review text took too long to load."
                : error instanceof Error
                  ? error.message
                  : "Reviews could not be loaded",
          });
        }
      });
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [activeTab, actorName, reviews.data, reviews.error, state.data?.reviewCount, username]);

  if (!state.data && !state.error) {
    return (
      <div className="border-border bg-card flex min-h-72 items-center justify-center border p-8 text-center">
        <div>
          <LoaderCircle className="text-signal-orange mx-auto h-6 w-6 animate-spin" />
          <p className="mt-4 font-semibold">Loading public Actor documentation</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Reading the current public Store definition and reviews.
          </p>
        </div>
      </div>
    );
  }

  if (state.error || !state.data) {
    return (
      <div className="border-border bg-card border p-6">
        <p className="font-semibold">Public documentation is temporarily unavailable</p>
        <p className="text-muted-foreground mt-2 text-sm leading-6">{state.error}</p>
        <a
          className="text-signal-blue mt-4 inline-flex items-center gap-2 text-sm font-semibold"
          href={apifyUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open this Actor on Apify <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    );
  }

  const docs = state.data;
  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="border-border bg-card shadow-card border p-5 sm:p-7"
    >
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="type-kicker">Actor reference</p>
          <h2 className="font-display-tight mt-2 text-3xl">Documentation & feedback</h2>
        </div>
        <a
          className="text-signal-blue inline-flex items-center gap-2 text-sm font-semibold"
          href={docs.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Source: Apify Store <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <TabsList className="mt-7 h-auto w-full justify-start overflow-x-auto p-1">
        <TabsTrigger value="readme" className="whitespace-nowrap">
          <FileText className="h-3.5 w-3.5" /> README
        </TabsTrigger>
        <TabsTrigger value="input" className="whitespace-nowrap">Input schema</TabsTrigger>
        <TabsTrigger value="output" className="whitespace-nowrap">Output schema</TabsTrigger>
        <TabsTrigger value="changelog" className="whitespace-nowrap">
          <ScrollText className="h-3.5 w-3.5" /> Changelog
        </TabsTrigger>
        <TabsTrigger value="reviews" className="whitespace-nowrap">
          <MessageSquare className="h-3.5 w-3.5" /> Ratings & reviews
        </TabsTrigger>
      </TabsList>
      <TabsContent value="readme">
        {docs.readme ? (
          <ApifyMarkdown markdown={docs.readme} />
        ) : (
          <Unavailable label="README" />
        )}
      </TabsContent>
      <TabsContent value="input">
        <SchemaView schema={docs.inputSchema} label="input" />
      </TabsContent>
      <TabsContent value="output">
        <SchemaView schema={docs.outputSchema} label="output" />
      </TabsContent>
      <TabsContent value="changelog">
        <CatalogChangelog
          firstPublishedAt={firstPublishedAt}
          createdAt={createdAt}
          modifiedAt={modifiedAt}
          firstSeenAt={firstSeenAt}
          detailsSyncedAt={detailsSyncedAt}
          lastSeenAt={lastSeenAt}
        />
      </TabsContent>
      <TabsContent value="reviews">
        <RatingsAndReviews
          data={{
            ...docs,
            reviews: reviews.data ?? [],
            reviewError: reviews.error,
          }}
          apifyUrl={apifyUrl}
          loading={reviews.data == null && reviews.error == null}
        />
      </TabsContent>
    </Tabs>
  );
}

async function readJsonResponse<T extends { error?: string }>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      response.ok
        ? "ActorConsole returned an empty response"
        : `ActorConsole returned HTTP ${response.status}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      response.ok
        ? "ActorConsole returned an invalid documentation response"
        : `ActorConsole returned HTTP ${response.status}`,
    );
  }
}

function SchemaView({ schema, label }: { schema: unknown; label: string }) {
  if (!schema || typeof schema !== "object") return <Unavailable label={`${label} schema`} />;
  return <SchemaCodeView schema={schema} label={label} />;
}

function CatalogChangelog({
  firstPublishedAt,
  createdAt,
  modifiedAt,
  firstSeenAt,
  detailsSyncedAt,
  lastSeenAt,
}: {
  firstPublishedAt: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  firstSeenAt: string | null;
  detailsSyncedAt: string | null;
  lastSeenAt: string | null;
}) {
  const events = [
    {
      label: "Latest catalog snapshot",
      description: "ActorConsole refreshed this Actor's public Store details and metrics.",
      value: detailsSyncedAt,
      icon: RefreshCcw,
    },
    {
      label: "Last observed in the Store",
      description: "The Actor was present in the most recent public catalog scan.",
      value: lastSeenAt,
      icon: Database,
    },
    {
      label: "Latest public Actor update",
      description: "Apify reports this as the Actor's most recent modification time.",
      value: modifiedAt,
      icon: History,
    },
    {
      label: "First observed by ActorConsole",
      description: "The first durable catalog record collected for this Actor.",
      value: firstSeenAt,
      icon: Database,
    },
    {
      label: "Published in the Apify Store",
      description: "The Actor became available in the public Store.",
      value: firstPublishedAt,
      icon: CalendarClock,
    },
    {
      label: "Actor created",
      description: "The creation timestamp published by Apify.",
      value: createdAt,
      icon: CalendarClock,
    },
  ]
    .filter(
      (event): event is typeof event & { value: string } => Boolean(event.value),
    )
    .sort((left, right) => new Date(right.value).getTime() - new Date(left.value).getTime());

  if (!events.length) return <Unavailable label="catalog history" />;

  return (
    <div>
      <div className="border-border bg-muted/20 border p-5">
        <p className="font-semibold">Public Actor timeline</p>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Verifiable lifecycle and catalog events, newest first. Apify does not expose private
          release notes in its public Actor response.
        </p>
      </div>
      <ol className="border-border relative ml-4 border-l sm:ml-6">
        {events.map((event) => {
          const Icon = event.icon;
          return (
            <li key={event.label} className="relative py-5 pl-8 sm:pl-10">
              <span className="border-border bg-card absolute -left-4 top-5 flex h-8 w-8 items-center justify-center rounded-full border">
                <Icon className="text-signal-orange h-4 w-4" />
              </span>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold">{event.label}</p>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">
                    {event.description}
                  </p>
                </div>
                <time
                  dateTime={event.value}
                  className="text-muted-foreground shrink-0 font-mono text-xs"
                >
                  {new Date(event.value).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function RatingsAndReviews({
  data,
  apifyUrl,
  loading,
}: {
  data: Documentation;
  apifyUrl: string;
  loading: boolean;
}) {
  const rating = data.rating ?? 0;
  return (
    <div className="space-y-6">
      <div className="border-border bg-muted/20 grid gap-5 border p-5 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div>
          <p className="font-display-tight text-5xl tabular-nums">
            {rating ? rating.toFixed(1) : "—"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">out of 5</p>
        </div>
        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map((value) => {
            const count = data.ratingBreakdown?.[String(value)] ?? 0;
            const total = data.reviewCount ?? 0;
            return (
              <div
                key={value}
                className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs"
              >
                <span className="inline-flex items-center gap-1">
                  {value}
                  <Star className="h-3 w-3 fill-current" />
                </span>
                <span className="bg-border h-2 overflow-hidden">
                  <span
                    className="bg-signal-orange block h-full"
                    style={{ width: `${total ? Math.round((count / total) * 100) : 0}%` }}
                  />
                </span>
                <span className="text-muted-foreground text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
      {loading ? (
        <div className="border-border bg-muted/20 flex items-center gap-3 border p-5 text-sm">
          <LoaderCircle className="text-signal-orange h-4 w-4 animate-spin" />
          Loading published reviews…
        </div>
      ) : data.reviews.length ? (
        <div className="space-y-3">
          {data.reviews.map((review, index) => (
            <article
              key={review.id || `${review.authorName}-${index}`}
              className="border-border border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {review.authorName ?? review.authorUsername ?? "Apify user"}
                </p>
                <Badge variant="outline">{review.rating.toFixed(0)} / 5</Badge>
              </div>
              {review.createdAt ? (
                <p className="text-muted-foreground mt-1 font-mono text-[10px]">
                  {new Date(review.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                </p>
              ) : null}
              {review.text ? (
                <p className="text-muted-foreground mt-3 text-sm leading-6">{review.text}</p>
              ) : (
                <p className="text-muted-foreground mt-3 text-sm">
                  This rating has no written review.
                </p>
              )}
              {review.developerReply ? (
                <div className="border-signal-blue bg-signal-blue/5 mt-4 border-l-2 px-3 py-2 text-sm leading-6">
                  <p className="font-semibold">Developer response</p>
                  <p className="text-muted-foreground mt-1">{review.developerReply}</p>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="border-border bg-muted/20 border p-5">
          <p className="font-semibold">{data.reviewCount ?? 0} ratings on Apify</p>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            {data.reviewError ??
              "Apify publishes the aggregate rating, but did not expose individual written review text for this Actor."}
          </p>
        </div>
      )}
      <a
        className="text-signal-blue inline-flex items-center gap-2 text-sm font-semibold"
        href={`${apifyUrl.replace(/\/$/, "")}/reviews`}
        target="_blank"
        rel="noreferrer"
      >
        View ratings and reviews on Apify <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}

function Unavailable({ label }: { label: string }) {
  return (
    <div className="border-border bg-muted/20 text-muted-foreground border border-dashed p-7 text-sm">
      This Actor does not expose a public {label}.
    </div>
  );
}
