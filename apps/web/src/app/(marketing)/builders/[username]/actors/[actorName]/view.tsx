import { EarningsBand } from "@/components/intelligence/earnings-summary";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";
import { ObservedMetricBarChart } from "@/components/marketing/observed-metric-bar-chart";
import { PublicActorDocumentation } from "@/components/marketing/public-actor-documentation";
import { PublicCompareButton } from "@/components/comparison/public-comparison-provider";
import { actorCompareItem } from "@/components/comparison/public-comparison-items";
import {
  BUILDER_WINDOWS,
  getBuilderActorDetail,
  type BuilderWindow,
  type BuilderActorDetail,
} from "@/lib/builders";

export const dynamic = "force-dynamic";

function compact(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

function initials(name: string) {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleDateString("en-IN", { dateStyle: "medium" }) : "Not published";
}

function pricingLabel(model: string) {
  const normalized = model.replaceAll("_", " ").toLocaleLowerCase();
  return normalized === "pay per event"
    ? "Pay per event"
    : normalized.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; actorName: string }>;
}): Promise<Metadata> {
  const { username, actorName } = await params;
  const actor = await getBuilderActorDetail(username, actorName);
  return actor
    ? {
        title: `${actor.title} — Actor details`,
        description:
          actor.description ?? `Public Apify Actor details for ${username}/${actorName}.`,
      }
    : { title: "Actor not found" };
}

export default async function BuilderActorPage({
  params,
  searchParams,
  initialData,
}: {
  params: Promise<{ username: string; actorName: string }>;
  searchParams: Promise<{ window?: string }>;
  initialData?: BuilderActorDetail | null;
}) {
  const [{ username, actorName }, query] = await Promise.all([params, searchParams]);
  const parsedWindow = Number.parseInt(query.window ?? "30", 10);
  const window: BuilderWindow = BUILDER_WINDOWS.includes(parsedWindow as BuilderWindow)
    ? (parsedWindow as BuilderWindow)
    : 30;
  const actor =
    initialData !== undefined
      ? initialData
      : await getBuilderActorDetail(username, actorName, window);
  if (!actor) notFound();
  const observedTrendDays = actor.trend.filter((point) => point.observed).length;

  return (
    <div className="bg-mist">
      <HomeGridSection>
        <HomeGridRow>
          <HomeGridCell className="col-span-12 px-6 py-8 sm:px-8 sm:py-10 lg:p-12">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/builders/${encodeURIComponent(actor.username)}?window=${window}`}>
                  <ArrowLeft className="h-4 w-4" />
                  {actor.ownerName ?? `@${actor.username}`}
                </Link>
              </Button>
              <p className="text-muted-foreground font-mono text-xs">
                Catalog ID {actor.apifyActorId}
              </p>
            </div>

            <div className="bg-card border-border shadow-card mt-6 border p-5 sm:p-8 lg:p-10">
              <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-col gap-5 sm:flex-row">
                  <Avatar className="border-border bg-muted h-24 w-24 shrink-0 rounded-2xl border sm:h-28 sm:w-28">
                    {actor.pictureUrl ? <AvatarImage src={actor.pictureUrl} alt="" /> : null}
                    <AvatarFallback className="rounded-2xl font-mono text-xl">
                      {initials(actor.title)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="type-kicker text-signal-orange">Public Apify Actor</p>
                    <h1 className="font-display-tight mt-3 max-w-5xl break-words text-4xl leading-[.98] sm:text-5xl lg:text-6xl">
                      {actor.title}
                    </h1>
                    <p className="text-muted-foreground mt-3 font-mono text-sm">
                      {actor.username}/{actor.name}
                    </p>
                    <p className="text-muted-foreground mt-5 max-w-4xl text-sm leading-6 sm:text-base sm:leading-7">
                      {actor.description ??
                        "This Actor does not currently expose a public Store description."}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <PublicCompareButton item={actorCompareItem(actor.username, actor, window)} />
                  <Button asChild>
                    <a href={actor.apifyUrl} target="_blank" rel="noreferrer">
                      Open on Apify
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>

              <div className="border-border bg-border mt-8 grid grid-cols-2 gap-px overflow-hidden border sm:grid-cols-3 xl:grid-cols-6">
                <HeroMetric
                  label={`Active users / ${window}d`}
                  value={compact(actor.activeUsers)}
                />
                <HeroMetric label="Total users" value={compact(actor.totalUsers)} />
                <HeroMetric label="Runs / 30d" value={compact(actor.runs30Days)} />
                <HeroMetric label="Total runs" value={compact(actor.totalRuns)} />
                <HeroMetric
                  label="Rating"
                  value={
                    actor.rating == null || actor.reviewCount === 0 ? "—" : actor.rating.toFixed(1)
                  }
                  detail={actor.reviewCount ? `${actor.reviewCount} reviews` : "No reviews"}
                />
                <HeroMetric label="Bookmarks" value={compact(actor.bookmarks)} />
              </div>
            </div>
          </HomeGridCell>
        </HomeGridRow>
      </HomeGridSection>

      <HomeGridSection className="bg-fog/35">
        <HomeGridRow>
          <HomeGridCell className="col-span-12 px-6 py-12 sm:px-8 sm:py-14 lg:p-12">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,.7fr)]">
              <div className="border-border bg-card shadow-card border p-5 sm:p-7">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                  <div>
                    <p className="type-kicker">Usage history</p>
                    <h2 className="font-display-tight mt-2 text-3xl">Observed catalog snapshots</h2>
                  </div>
                  <Badge variant="outline">
                    {observedTrendDays} observed {observedTrendDays === 1 ? "day" : "days"}
                  </Badge>
                </div>
                <TrendChart points={actor.trend} />
                <div className="border-border mt-7 grid grid-cols-3 divide-x border">
                  <WindowMetric label="Users / 7d" value={actor.users7Days} />
                  <WindowMetric label="Users / 30d" value={actor.users30Days} />
                  <WindowMetric label="Users / 90d" value={actor.users90Days} />
                </div>
              </div>

              <aside className="semantic-accent-panel border-border text-foreground border p-5 sm:p-7">
                <p className="type-kicker text-white/55">Catalog record</p>
                <dl className="mt-7 space-y-5">
                  <Readout label="First published" value={formatDate(actor.firstPublishedAt)} />
                  <Readout label="Actor created" value={formatDate(actor.createdAt)} />
                  <Readout label="Actor modified" value={formatDate(actor.modifiedAt)} />
                  <Readout label="First observed in Store" value={formatDate(actor.firstSeenAt)} />
                  <Readout label="Details updated" value={formatDate(actor.detailsSyncedAt)} />
                  <Readout label="Last seen in Store" value={formatDate(actor.lastSeenAt)} />
                </dl>
                <p className="mt-7 border-t border-white/15 pt-5 text-xs leading-5 text-white/55">
                  Metrics reflect the latest available Store data and may lag behind the live Store.
                </p>
              </aside>
            </div>
          </HomeGridCell>
        </HomeGridRow>
      </HomeGridSection>

      <HomeGridSection>
        <HomeGridRow>
          <HomeGridCell className="col-span-12 px-6 py-12 sm:px-8 sm:py-16 lg:p-12 lg:py-20">
            <div className="grid gap-6 lg:grid-cols-2">
              <InfoPanel title="Store classification" kicker="Discoverability">
                <TokenGroup label="Categories" values={actor.categories} />
                <TokenGroup label="Store labels" values={actor.metaLabels} />
              </InfoPanel>
              <InfoPanel title="Pricing configuration" kicker="Monetization">
                {actor.pricing.length ? (
                  <div className="space-y-3">
                    {actor.pricing.map((price, index) => (
                      <div
                        key={`${price.model}-${index}`}
                        className="border-border bg-muted/25 border p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-semibold">{pricingLabel(price.model)}</p>
                          {pricingLabel(price.model) === "Pay per event" ? (
                            <Badge className="bg-signal-orange text-ink hover:bg-signal-orange">
                              Current model
                            </Badge>
                          ) : (
                            <Badge variant="outline">Catalog value</Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-2 text-sm leading-6">
                          {price.eventCount > 0
                            ? `${price.eventCount} charge event${price.eventCount === 1 ? "" : "s"} configured`
                            : price.pricePerUnitUsd != null
                              ? `$${price.pricePerUnitUsd.toFixed(4)} per ${price.unitName ?? "unit"}`
                              : "Apify does not expose a public unit price for this configuration."}
                        </p>
                        {price.events.length ? (
                          <div className="border-border mt-4 divide-y border-t">
                            {price.events.map((event) => (
                              <div
                                key={event.name}
                                className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold">{event.title}</p>
                                    {event.isPrimary ? (
                                      <Badge variant="outline">Primary</Badge>
                                    ) : null}
                                    {event.isOneTime ? (
                                      <Badge variant="outline">One-time</Badge>
                                    ) : null}
                                  </div>
                                  <p className="text-muted-foreground mt-1 break-all font-mono text-[10px]">
                                    {event.name}
                                  </p>
                                  {event.description ? (
                                    <p className="text-muted-foreground mt-2 text-xs leading-5">
                                      {event.description}
                                    </p>
                                  ) : null}
                                </div>
                                <p className="font-mono text-sm font-semibold tabular-nums">
                                  {event.priceUsd == null
                                    ? "Price unavailable"
                                    : `$${event.priceUsd.toLocaleString("en-US", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 6,
                                      })}`}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm leading-6">
                    Pricing metadata has not been exposed or enriched for this Actor yet.
                  </p>
                )}
              </InfoPanel>
            </div>

            <div className="mt-12">
              <PublicActorDocumentation
                username={actor.username}
                actorName={actor.name}
                firstPublishedAt={actor.firstPublishedAt?.toISOString() ?? null}
                createdAt={actor.createdAt?.toISOString() ?? null}
                modifiedAt={actor.modifiedAt?.toISOString() ?? null}
                firstSeenAt={actor.firstSeenAt?.toISOString() ?? null}
                detailsSyncedAt={actor.detailsSyncedAt?.toISOString() ?? null}
                lastSeenAt={actor.lastSeenAt?.toISOString() ?? null}
                apifyUrl={actor.apifyUrl}
              />
            </div>

            {actor.relatedActors.length ? (
              <div className="mt-12">
                <p className="type-kicker">More from this builder</p>
                <h2 className="font-display-tight mt-2 text-3xl">Related Actors</h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {actor.relatedActors.map((related) => (
                    <Link
                      key={related.id}
                      href={`${related.internalUrl}?window=${window}`}
                      className="border-border bg-card hover:bg-accent/45 focus-visible:ring-ring group border p-5 transition-colors focus-visible:outline-none focus-visible:ring-2"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="border-border h-10 w-10 rounded-lg border">
                          {related.pictureUrl ? (
                            <AvatarImage src={related.pictureUrl} alt="" />
                          ) : null}
                          <AvatarFallback className="rounded-lg text-xs">
                            {initials(related.title)}
                          </AvatarFallback>
                        </Avatar>
                        <p className="group-hover:text-signal-blue line-clamp-2 font-semibold leading-5">
                          {related.title}
                        </p>
                      </div>
                      <p className="text-muted-foreground mt-4 text-xs">
                        {compact(related.activeUsers)} active users · {compact(related.runs30Days)}{" "}
                        runs / 30d
                      </p>
                      <div className="mt-4">
                        <p className="text-muted-foreground mb-2 text-xs">
                          Est. monthly creator revenue
                        </p>
                        <EarningsBand value={related.earnings} compact />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </HomeGridCell>
        </HomeGridRow>
      </HomeGridSection>
    </div>
  );
}

function HeroMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="bg-card p-4 sm:p-5">
      <p className="type-kicker leading-4">{label}</p>
      <p className="font-display-tight mt-3 text-3xl tabular-nums">{value}</p>
      {detail ? <p className="text-muted-foreground mt-1 text-[10px]">{detail}</p> : null}
    </div>
  );
}

function WindowMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-4 text-center">
      <p className="font-display-tight text-2xl tabular-nums">{compact(value)}</p>
      <p className="text-muted-foreground mt-1 text-[10px]">{label}</p>
    </div>
  );
}

function TrendChart({
  points,
}: {
  points: Array<{
    date: string;
    observed: boolean;
    users: number | null;
    runs: number | null;
  }>;
}) {
  return (
    <div className="mt-7 grid gap-6 lg:grid-cols-2">
      <div className="border-border bg-muted/15 border p-4 sm:p-5">
        <ObservedMetricBarChart
          points={points.map((point) => ({
            date: point.date,
            value: point.users,
            observed: point.observed,
          }))}
          label="Active users / 30d"
          tone="blue"
          emptyMessage="No active-user snapshot has been captured for this Actor yet."
        />
      </div>
      <div className="border-border bg-muted/15 border p-4 sm:p-5">
        <ObservedMetricBarChart
          points={points.map((point) => ({
            date: point.date,
            value: point.runs,
            observed: point.observed,
          }))}
          label="Runs / 30d"
          tone="orange"
          emptyMessage="No run snapshot has been captured for this Actor yet."
        />
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/15 pb-4">
      <dt className="text-xs leading-5 text-white/55">{label}</dt>
      <dd className="text-right font-mono text-xs font-semibold tabular-nums text-white">
        {value}
      </dd>
    </div>
  );
}

function InfoPanel({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <article className="border-border bg-card shadow-card border p-5 sm:p-7">
      <p className="type-kicker text-signal-blue">{kicker}</p>
      <h2 className="font-display-tight mt-2 text-3xl">{title}</h2>
      <div className="mt-6 space-y-6">{children}</div>
    </article>
  );
}

function TokenGroup({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="type-kicker">{label}</p>
      {values.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {values.map((value) => (
            <Badge key={value} variant="outline">
              {value}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground mt-2 text-sm">No public values available.</p>
      )}
    </div>
  );
}
