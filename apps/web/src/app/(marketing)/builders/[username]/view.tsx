import { EarningsBand } from "@/components/intelligence/earnings-summary";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, PlayCircle, Search, Star, Users } from "lucide-react";
import { BuilderProfileChart } from "@/components/marketing/builder-profile-chart";
import { BuilderActorViewToggle } from "@/components/marketing/builder-actor-view-toggle";
import { PublicCompareButton } from "@/components/comparison/public-comparison-provider";
import {
  actorCompareItem,
  builderCompareItem,
} from "@/components/comparison/public-comparison-items";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";
import {
  BUILDER_ACTOR_SORTS,
  BUILDER_WINDOWS,
  getBuilderProfile,
  type BuilderActorSort,
  type BuilderWindow,
  type BuilderProfile,
} from "@/lib/builders";
import type { CollectionViewMode } from "@/components/ui/view-mode-toggle";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getBuilderProfile(username);
  return profile
    ? {
        title: `${profile.name ?? username} — Apify builder`,
        description: profile.bio ?? `Explore ${username}'s public Apify Actor portfolio.`,
      }
    : { title: "Builder not found", robots: { index: false } };
}

function compact(value: number | null) {
  if (value == null) return "Unavailable";
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

function signed(value: number | null) {
  if (value == null) return "Baseline forming";
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${compact(value)} since first snapshot`;
}

type ActorFilters = {
  query: string;
  category: string;
  sort: BuilderActorSort;
};

function actorPageHref(
  username: string,
  window: BuilderWindow,
  page: number,
  filters?: ActorFilters,
  view: CollectionViewMode = "grid",
) {
  const params = new URLSearchParams({ window: String(window) });
  if (filters?.query) params.set("actorQ", filters.query);
  if (filters?.category) params.set("actorCategory", filters.category);
  if (filters?.sort && filters.sort !== "active-users") params.set("actorSort", filters.sort);
  if (view === "list") params.set("view", "list");
  if (page > 1) params.set("actorPage", String(page));
  return `/builders/${encodeURIComponent(username)}?${params.toString()}`;
}

function categoryLabel(value: string) {
  return value
    .toLocaleLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(" ");
}

export default async function BuilderProfilePage({
  params,
  searchParams,
  initialData,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{
    window?: string;
    actorPage?: string;
    actorQ?: string;
    actorCategory?: string;
    actorSort?: string;
    view?: string;
  }>;
  initialData?: BuilderProfile | null;
}) {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const parsedWindow = Number.parseInt(query.window ?? "30", 10);
  const window: BuilderWindow = BUILDER_WINDOWS.includes(parsedWindow as BuilderWindow)
    ? (parsedWindow as BuilderWindow)
    : 30;
  const parsedActorPage = Number.parseInt(query.actorPage ?? "1", 10);
  const actorSort = BUILDER_ACTOR_SORTS.some((item) => item.value === query.actorSort)
    ? (query.actorSort as BuilderActorSort)
    : "active-users";
  const actorView: CollectionViewMode = query.view === "list" ? "list" : "grid";
  const profile =
    initialData !== undefined
      ? initialData
      : await getBuilderProfile(username, {
          window,
          actorPage: Number.isFinite(parsedActorPage) ? parsedActorPage : 1,
          actorQuery: query.actorQ,
          actorCategory: query.actorCategory,
          actorSort,
        });
  if (!profile) notFound();

  const displayName = profile.name ?? profile.username;
  const latestRunCoverage = profile.runCounterCoverage;
  const partialRuns = latestRunCoverage && latestRunCoverage.known < latestRunCoverage.total;
  return (
    <div className="bg-mist">
      <HomeGridSection>
        <HomeGridRow>
          <HomeGridCell className="col-span-12 px-6 py-8 sm:px-8 sm:py-10 lg:p-12">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/builders?window=${window}`}>
                  <ArrowLeft className="h-4 w-4" />
                  Leaderboard
                </Link>
              </Button>
              <p className="font-mono text-xs text-muted-foreground">
                Last observed{" "}
                {profile.lastUpdatedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
              </p>
            </div>

            <div className="mt-6 border border-border bg-card p-5 shadow-card sm:p-8 lg:p-10">
              <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
                  <Avatar className="h-20 w-20 border border-border bg-muted sm:h-24 sm:w-24">
                    {profile.pictureUrl ? <AvatarImage src={profile.pictureUrl} alt="" /> : null}
                    <AvatarFallback className="font-mono text-xl">
                      {initials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="type-kicker text-signal-orange">Apify builder</p>
                    <h1 className="font-display-tight mt-3 break-words text-4xl sm:text-5xl lg:text-6xl">
                      {displayName}
                    </h1>
                    <p className="mt-2 font-mono text-sm text-muted-foreground">
                      @{profile.username}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {BUILDER_WINDOWS.map((days) => (
                    <Button
                      key={days}
                      variant={window === days ? "default" : "outline"}
                      size="sm"
                      asChild
                    >
                      <Link
                        href={actorPageHref(
                          profile.username,
                          days,
                          1,
                          profile.actorFilters,
                          actorView,
                        )}
                      >
                        {days} days
                      </Link>
                    </Button>
                  ))}
                  {profile.isAvailable !== false ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={profile.apifyUrl} target="_blank" rel="noreferrer">
                        View on Apify
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  ) : null}
                  {profile.isAvailable !== false ? (
                    <PublicCompareButton item={builderCompareItem(profile, window)} />
                  ) : null}
                </div>
              </div>

              {profile.isAvailable === false ? (
                <p role="status" className="mt-8 border-t border-border pt-7 text-sm">
                  No current public Actors are available for this builder. Recorded history is
                  preserved below; this portfolio is excluded from current rankings.
                </p>
              ) : (
                <>
                  <div className="mt-8 border-t border-border pt-7">
                    <div className="flex items-center justify-between gap-4">
                      <p className="type-kicker text-signal-blue">Leaderboard position</p>
                      <p className="text-xs text-muted-foreground">
                        out of {profile.totalBuilders.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden border bg-border sm:grid-cols-3 xl:grid-cols-7">
                      <RankMetric
                        label={`New Actors / ${window}d`}
                        rank={profile.newActorCount == null ? null : profile.ranks["new-actors"]}
                      />
                      <RankMetric label="Total Actors" rank={profile.ranks.actors} />
                      <RankMetric
                        label={`Active users / ${window}d`}
                        rank={profile.ranks["monthly-users"]}
                      />
                      <RankMetric label="Total users" rank={profile.ranks["total-users"]} />
                      <RankMetric label="Runs / 30d" rank={profile.ranks["monthly-runs"]} />
                      <RankMetric label="Total runs" rank={profile.ranks["total-runs"]} />
                      <RankMetric
                        label="Est. revenue / 30d"
                        rank={
                          profile.earnings?.centralUsd != null
                            ? profile.ranks["estimated-revenue"]
                            : null
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-7 border-t border-border pt-7">
                    <p className="type-kicker text-signal-blue">Portfolio stats</p>
                    <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-6">
                      <PortfolioMetric
                        label={`New Actors / ${window}d`}
                        value={profile.newActorCount}
                        detail={
                          profile.newActorCount == null ? "Publication dates incomplete" : undefined
                        }
                      />
                      <PortfolioMetric label="Total Actors" value={profile.actorCount} />
                      <PortfolioMetric
                        label={`Active users / ${window}d`}
                        value={profile.activeUsers}
                        detail={window === 30 ? signed(profile.changes.users) : undefined}
                      />
                      <PortfolioMetric label="Total users" value={profile.totalUsers} />
                      <PortfolioMetric
                        label="Runs / 30d"
                        value={profile.recentRuns}
                        detail={
                          partialRuns
                            ? `Partial · ${latestRunCoverage.known}/${latestRunCoverage.total} Actor counters`
                            : signed(profile.changes.runs)
                        }
                      />
                      <PortfolioMetric label="Total runs" value={profile.totalRuns} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </HomeGridCell>
        </HomeGridRow>
      </HomeGridSection>

      <HomeGridSection className="bg-fog/35">
        <HomeGridRow>
          <HomeGridCell className="col-span-12 px-6 py-12 sm:px-8 sm:py-14 lg:p-12">
            <div className="border border-border bg-card p-5 shadow-card sm:p-7 lg:p-9">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <p className="type-kicker">Portfolio history</p>
                  <h2 className="font-display-tight mt-2 text-3xl sm:text-4xl">
                    Activity across the selected window
                  </h2>
                </div>
                <Badge variant="outline">{window} days</Badge>
              </div>
              <BuilderProfileChart
                discoveries={profile.discoveryChart}
                actorConsolePublishing={profile.actorConsolePublishingChart}
                trends={profile.trendChart}
                window={window}
              />
            </div>
          </HomeGridCell>
        </HomeGridRow>
      </HomeGridSection>

      <HomeGridSection>
        <HomeGridRow>
          <HomeGridCell className="col-span-12 px-6 py-12 sm:px-8 sm:py-16 lg:p-12 lg:py-20">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="type-kicker">Actor portfolio</p>
                <h2 className="font-display-tight mt-2 text-3xl sm:text-4xl">
                  Current public Actors
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  {profile.actorTotal.toLocaleString("en-IN")} matching of{" "}
                  {profile.actorCount.toLocaleString("en-IN")} Actors
                  {profile.actorTotal > 0
                    ? ` · page ${profile.actorPage} of ${profile.actorPageCount}`
                    : ""}
                </p>
                <BuilderActorViewToggle view={actorView} />
              </div>
            </div>

            <form
              method="get"
              className="mt-8 border border-border bg-fog p-4 sm:p-5"
              aria-label="Filter Actor portfolio"
            >
              <input type="hidden" name="window" value={window} />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(18rem,1.5fr)_minmax(12rem,.8fr)_minmax(12rem,.8fr)_auto] xl:items-end">
                <label htmlFor="actor-search" className="grid gap-2">
                  <span className="type-kicker">Search Actors</span>
                  <span className="relative block">
                    <Search
                      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="actor-search"
                      type="search"
                      name="actorQ"
                      defaultValue={profile.actorFilters.query}
                      placeholder="Name, title, or description"
                      className="h-12 pl-11"
                    />
                  </span>
                </label>
                <label htmlFor="actor-category" className="grid gap-2">
                  <span className="type-kicker">Category</span>
                  <select
                    id="actor-category"
                    name="actorCategory"
                    defaultValue={profile.actorFilters.category}
                    className="h-12 rounded-md border border-input bg-card px-4 text-sm font-semibold text-card-foreground shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">All categories</option>
                    {profile.actorCategories.map((category) => (
                      <option key={category} value={category}>
                        {categoryLabel(category)}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="actor-sort" className="grid gap-2">
                  <span className="type-kicker">Sort by</span>
                  <select
                    id="actor-sort"
                    name="actorSort"
                    defaultValue={profile.actorFilters.sort}
                    className="h-12 rounded-md border border-input bg-card px-4 text-sm font-semibold text-card-foreground shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {BUILDER_ACTOR_SORTS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2 md:col-span-2 xl:col-span-1">
                  <Button type="submit" size="lg" className="h-12 flex-1 xl:flex-none">
                    Apply
                  </Button>
                  {profile.actorFilters.query ||
                  profile.actorFilters.category ||
                  profile.actorFilters.sort !== "active-users" ? (
                    <Button variant="ghost" size="lg" className="h-12" asChild>
                      <Link href={actorPageHref(profile.username, window, 1, undefined, actorView)}>
                        Clear
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </form>

            {profile.actors.length > 0 ? (
              <div
                className={
                  actorView === "grid"
                    ? "mt-6 grid gap-5 lg:grid-cols-2"
                    : "mt-6 divide-y border border-border bg-card shadow-card"
                }
              >
                {profile.actors.map((actor) => {
                  const share =
                    profile.activeUsers > 0 ? (actor.activeUsers / profile.activeUsers) * 100 : 0;
                  return (
                    <article
                      key={actor.id}
                      className={
                        actorView === "grid"
                          ? "group flex min-h-64 flex-col border border-border bg-card p-5 shadow-card sm:p-6"
                          : "group grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6"
                      }
                    >
                      <div className="flex items-start gap-4">
                        <Avatar className="h-16 w-16 shrink-0 rounded-xl border border-border bg-muted">
                          {actor.pictureUrl ? <AvatarImage src={actor.pictureUrl} alt="" /> : null}
                          <AvatarFallback className="rounded-xl font-mono">
                            {initials(actor.title)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={actor.internalUrl}
                            className="group/link inline-flex max-w-full items-start gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <h3 className="line-clamp-2 text-lg font-semibold leading-snug group-hover/link:text-signal-blue">
                              {actor.title}
                            </h3>
                            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover/link:translate-x-1" />
                          </Link>
                          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                            {profile.username}/{actor.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-display-tight text-3xl tabular-nums text-signal-orange">
                            {Math.round(share)}%
                          </p>
                          <p className="type-kicker">users</p>
                        </div>
                      </div>
                      <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {actor.description ?? "No public Store description is available yet."}
                      </p>
                      <div
                        className={
                          actorView === "grid"
                            ? "mt-auto grid grid-cols-3 gap-4 pt-6"
                            : "grid grid-cols-3 gap-4 sm:col-start-2 sm:row-start-1 sm:w-72"
                        }
                      >
                        <ActorMetric
                          icon={Users}
                          label={`Users / ${window}d`}
                          value={compact(actor.activeUsers)}
                        />
                        <ActorMetric
                          icon={PlayCircle}
                          label="Runs / 30d"
                          value={compact(actor.runs30Days)}
                        />
                        <ActorMetric
                          icon={Star}
                          label="Rating"
                          value={
                            actor.rating == null || actor.reviewCount === 0
                              ? "—"
                              : actor.rating.toFixed(1)
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <p className="mb-2 text-xs text-muted-foreground">
                          Est. monthly creator revenue
                        </p>
                        <EarningsBand value={actor.earnings} compact />
                        {actor.earnings?.reason && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {actor.earnings.reason}
                          </p>
                        )}
                      </div>
                      <div
                        className={
                          actorView === "grid"
                            ? "mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-4 text-xs font-semibold"
                            : "flex flex-wrap items-center gap-4 border-t border-border pt-4 text-xs font-semibold sm:col-span-2"
                        }
                      >
                        <Link href={actor.internalUrl} className="text-signal-blue hover:underline">
                          View Actor details
                        </Link>
                        <PublicCompareButton
                          item={actorCompareItem(profile.username, actor, window)}
                        />
                        <a
                          href={actor.apifyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          View on Apify
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6 border border-dashed border-border bg-muted/20 px-5 py-14 text-center">
                <p className="font-semibold">No Actors match these filters</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Try a broader search or clear the category and sort selections.
                </p>
                <Button variant="outline" className="mt-5" asChild>
                  <Link href={actorPageHref(profile.username, window, 1, undefined, actorView)}>
                    Clear filters
                  </Link>
                </Button>
              </div>
            )}

            {profile.actorPageCount > 1 ? (
              <nav
                className="mt-7 flex items-center justify-between gap-4"
                aria-label="Actor portfolio pages"
              >
                <Button
                  variant="outline"
                  disabled={profile.actorPage <= 1}
                  asChild={profile.actorPage > 1}
                >
                  {profile.actorPage > 1 ? (
                    <Link
                      href={actorPageHref(
                        profile.username,
                        window,
                        profile.actorPage - 1,
                        profile.actorFilters,
                        actorView,
                      )}
                    >
                      Previous
                    </Link>
                  ) : (
                    <span>Previous</span>
                  )}
                </Button>
                <p className="font-mono text-xs text-muted-foreground">
                  Page {profile.actorPage} of {profile.actorPageCount}
                </p>
                <Button
                  variant="outline"
                  disabled={profile.actorPage >= profile.actorPageCount}
                  asChild={profile.actorPage < profile.actorPageCount}
                >
                  {profile.actorPage < profile.actorPageCount ? (
                    <Link
                      href={actorPageHref(
                        profile.username,
                        window,
                        profile.actorPage + 1,
                        profile.actorFilters,
                        actorView,
                      )}
                    >
                      Next
                    </Link>
                  ) : (
                    <span>Next</span>
                  )}
                </Button>
              </nav>
            ) : null}
          </HomeGridCell>
        </HomeGridRow>
      </HomeGridSection>
    </div>
  );
}

function RankMetric({ label, rank }: { label: string; rank: number | null }) {
  return (
    <div className="bg-card p-4 sm:p-5">
      <p className="type-kicker min-h-8 leading-4">{label}</p>
      <p className="font-display-tight mt-3 text-3xl tabular-nums">
        {rank == null ? "—" : `#${rank}`}
      </p>
    </div>
  );
}

function PortfolioMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | null;
  detail?: string;
}) {
  return (
    <div>
      <p className="type-kicker leading-4">{label}</p>
      <p className="font-display-tight mt-2 text-3xl tabular-nums">{compact(value)}</p>
      {detail ? <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function ActorMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <p className="mt-2 font-mono text-sm font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
