import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLogger } from "@actorconsole/shared";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { LeaderboardControls } from "@/components/marketing/leaderboard-controls";
import { PublicCompareButton } from "@/components/comparison/public-comparison-provider";
import { builderCompareItem } from "@/components/comparison/public-comparison-items";
import { EarningsBand, EarningsMethod } from "@/components/intelligence/earnings-summary";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PublicGridSection } from "@/components/marketing/public-grid-section";
import { LeaderboardTableSkeleton } from "@/components/marketing/public-data-skeleton";
import {
  BUILDER_METRICS,
  BUILDER_WINDOWS,
  getBuilderLeaderboard,
  metricLabel,
  type BuilderMetric,
  type BuilderSortDirection,
  type BuilderWindow,
} from "@/lib/builders";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
const log = getLogger("web:builders");
export const metadata: Metadata = {
  title: "Apify Builder Leaderboard",
  description: "Rank Apify builders by estimated monthly creator revenue, Actors, users, and runs.",
};
const compact = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const initials = (name: string) =>
  (name.match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
type Filters = {
  metric: BuilderMetric;
  direction: BuilderSortDirection;
  window: BuilderWindow;
  query: string;
};
type Params = {
  metric?: string;
  direction?: string;
  window?: string;
  q?: string;
  page?: string;
  view?: string;
};
function filtersFrom(params: Params): Filters {
  const days = Number(params.window ?? 30);
  return {
    metric: BUILDER_METRICS.some((item) => item.value === params.metric)
      ? (params.metric as BuilderMetric)
      : "estimated-revenue",
    direction: params.direction === "asc" ? "asc" : "desc",
    window: BUILDER_WINDOWS.includes(days as BuilderWindow) ? (days as BuilderWindow) : 30,
    query: params.q?.trim().slice(0, 100) ?? "",
  };
}
function href(filters: Filters, updates: Record<string, string>) {
  const params = new URLSearchParams({
    metric: filters.metric,
    direction: filters.direction,
    window: String(filters.window),
    ...updates,
  });
  if (filters.query) params.set("q", filters.query);
  return `/builders?${params.toString()}`;
}
export default async function BuildersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const filters = filtersFrom(params);
  const requested = Number(params.page);
  const page = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 1;
  return (
    <main className="bg-background">
      <PublicGridSection>
        <header>
          <h1 className="font-display-tight text-3xl sm:text-4xl">Apify builder leaderboard</h1>
          <p className="text-muted-foreground mt-2 max-w-[75ch] text-sm leading-6">
            Rank builders by estimated monthly creator revenue, portfolio size, users, or runs.
          </p>
        </header>
      </PublicGridSection>
      <PublicGridSection>
        <div className="mb-6">
          <LeaderboardControls
            metric={filters.metric}
            window={filters.window}
            query={filters.query}
            view="list"
            tableOnly
          />
        </div>
        <Suspense
          key={[filters.metric, filters.direction, filters.window, filters.query, page].join(":")}
          fallback={<LeaderboardTableSkeleton />}
        >
          <LeaderboardTable filters={filters} page={page} />
        </Suspense>
      </PublicGridSection>
    </main>
  );
}
async function LeaderboardTable({ filters, page }: { filters: Filters; page: number }) {
  let data: Awaited<ReturnType<typeof getBuilderLeaderboard>>;
  try {
    data = await getBuilderLeaderboard({ ...filters, page });
  } catch (error) {
    log.error({ error }, "Could not load builder leaderboard");
    return (
      <div role="alert" className="border-border border p-6">
        <h2 className="font-semibold">Leaderboard could not load</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Public catalog data is temporarily unavailable.
        </p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href={href(filters, { page: String(page) })}>Try again</Link>
        </Button>
      </div>
    );
  }
  const actorMetric: BuilderMetric = filters.metric === "new-actors" ? "new-actors" : "actors";
  const usersMetric: BuilderMetric =
    filters.metric === "total-users" ? "total-users" : "monthly-users";
  const runsMetric: BuilderMetric =
    filters.metric === "monthly-runs" ? "monthly-runs" : "total-runs";
  return (
    <>
      <div className="text-muted-foreground mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <p>
          {data.totalBuilders.toLocaleString("en-US")} builders ranked
          {filters.query ? ` · ${data.total.toLocaleString("en-US")} matches` : ""}
        </p>
        <p>
          {metricLabel(filters.metric, filters.window)} ·{" "}
          {filters.direction === "asc" ? "Lowest first" : "Highest first"}
        </p>
      </div>
      <div
        className="border-border overflow-x-auto border-y"
        role="region"
        aria-label="Builder leaderboard"
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Builder rankings with public usage and estimated monthly creator revenue in US dollars.
          </caption>
          <thead className="bg-muted/40 text-muted-foreground border-border border-b text-xs">
            <tr>
              <th scope="col" className="w-8 px-2 py-3 text-left sm:w-14 sm:px-4">
                #
              </th>
              <th scope="col" className="px-2 py-3 text-left sm:px-4">
                Builder
              </th>
              <SortColumn
                label={actorMetric === "new-actors" ? `New / ${filters.window}d` : "Actors"}
                metric={actorMetric}
                filters={filters}
              />
              <SortColumn
                label={runsMetric === "monthly-runs" ? "Runs / 30d" : "Total runs"}
                metric={runsMetric}
                filters={filters}
              />
              <SortColumn
                label={usersMetric === "total-users" ? "Total users" : `Users / ${filters.window}d`}
                metric={usersMetric}
                filters={filters}
              />
              <SortColumn
                label="Est. revenue / month"
                metric="estimated-revenue"
                filters={filters}
                revenue
              />
              <th scope="col" className="hidden px-4 py-3 text-right lg:table-cell">
                <span className="sr-only">Compare builders</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {data.items.map((builder) => {
              const name = builder.name ?? builder.username;
              const selectedUsage = {
                "new-actors": builder.newActorCount,
                actors: builder.actorCount,
                "monthly-users": builder.activeUsers,
                "total-users": builder.totalUsers,
                "monthly-runs": builder.recentRuns,
                "total-runs": builder.totalRuns,
                "estimated-revenue": 0,
              }[filters.metric];
              return (
                <tr key={builder.username} className="hover:bg-muted/30 transition-colors">
                  <td className="text-muted-foreground px-2 py-4 align-top font-mono text-xs tabular-nums sm:px-4 lg:align-middle">
                    {builder.rank}
                  </td>
                  <th
                    scope="row"
                    className="max-w-[9rem] px-2 py-4 text-left align-top font-normal sm:max-w-none sm:px-4 lg:align-middle"
                  >
                    <Link
                      href={`/builders/${encodeURIComponent(builder.username)}?window=${filters.window}`}
                      className="group flex min-w-0 items-center gap-3 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                    >
                      <Avatar className="border-border hidden h-9 w-9 shrink-0 border sm:flex">
                        {builder.pictureUrl && <AvatarImage src={builder.pictureUrl} alt="" />}
                        <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="group-hover:text-signal-blue block break-words font-semibold sm:truncate">
                          {name}
                        </span>
                        <span className="text-muted-foreground mt-1 hidden font-mono text-xs sm:block">
                          @{builder.username}
                        </span>
                      </span>
                    </Link>
                    <p className="text-muted-foreground mt-2 text-[11px] lg:hidden">
                      {filters.metric === "estimated-revenue" ? (
                        <>
                          {compact(builder.actorCount)} Actors · {compact(builder.activeUsers)}{" "}
                          users / {filters.window}d
                        </>
                      ) : (
                        <>
                          {compact(selectedUsage)} · {metricLabel(filters.metric, filters.window)}
                        </>
                      )}
                    </p>
                    <PublicCompareButton
                      item={builderCompareItem(builder, filters.window, filters.metric)}
                      className="mt-3 h-7 px-2 text-[11px] lg:hidden"
                    />
                  </th>
                  <td className="hidden px-4 py-4 text-right tabular-nums lg:table-cell">
                    {compact(
                      actorMetric === "new-actors" ? builder.newActorCount : builder.actorCount,
                    )}
                  </td>
                  <td className="hidden px-4 py-4 text-right tabular-nums lg:table-cell">
                    {compact(
                      runsMetric === "monthly-runs" ? builder.recentRuns : builder.totalRuns,
                    )}
                  </td>
                  <td className="hidden px-4 py-4 text-right tabular-nums lg:table-cell">
                    {compact(
                      usersMetric === "total-users" ? builder.totalUsers : builder.activeUsers,
                    )}
                  </td>
                  <td className="w-[48%] px-2 py-4 align-top sm:w-64 sm:px-4 lg:w-72 lg:align-middle">
                    <EarningsBand value={builder.earnings} compact emphasizeCentral />
                    <p className="text-muted-foreground mt-2 text-[10px] sm:text-[11px]">
                      {builder.earnings?.coveredActors ?? 0}/{builder.actorCount} Actors covered
                      {builder.earnings?.unavailableActors ? " · Partial" : ""}
                    </p>
                  </td>
                  <td className="hidden px-4 py-4 text-right lg:table-cell">
                    <PublicCompareButton
                      item={builderCompareItem(builder, filters.window, filters.metric)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data.items.length && (
          <div className="py-12 text-center">
            <h2 className="font-semibold">No matching builders</h2>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/builders">Clear filters</Link>
            </Button>
          </div>
        )}
      </div>
      <p className="text-muted-foreground mt-4 max-w-[90ch] text-xs leading-5">
        Revenue bands sum covered Actors’ public 30-day scenarios after an assumed creator share,
        before costs. Missing estimates appear last. User counts sum usage across Actors and may
        count people more than once. Official Apify and deprecated Actors are excluded.
      </p>
      <EarningsMethod />
      {data.pageCount > 1 && (
        <nav
          className="mt-6 flex items-center justify-between gap-3"
          aria-label="Leaderboard pages"
        >
          <Button variant="outline" disabled={data.page <= 1} asChild={data.page > 1}>
            {data.page > 1 ? (
              <Link href={href(filters, { page: String(data.page - 1) })}>Previous</Link>
            ) : (
              <span>Previous</span>
            )}
          </Button>
          <p className="text-muted-foreground text-xs">
            Page {data.page} of {data.pageCount}
          </p>
          <Button
            variant="outline"
            disabled={data.page >= data.pageCount}
            asChild={data.page < data.pageCount}
          >
            {data.page < data.pageCount ? (
              <Link href={href(filters, { page: String(data.page + 1) })}>Next</Link>
            ) : (
              <span>Next</span>
            )}
          </Button>
        </nav>
      )}
    </>
  );
}
function SortColumn({
  label,
  metric,
  filters,
  revenue = false,
}: {
  label: string;
  metric: BuilderMetric;
  filters: Filters;
  revenue?: boolean;
}) {
  const selected = filters.metric === metric;
  const Icon = selected ? (filters.direction === "desc" ? ArrowDown : ArrowUp) : ChevronsUpDown;
  return (
    <th
      scope="col"
      aria-sort={selected ? (filters.direction === "desc" ? "descending" : "ascending") : "none"}
      className={cn(
        "px-4 py-3 text-right font-medium",
        !revenue && "hidden lg:table-cell",
        revenue && "px-2 sm:px-4",
      )}
    >
      <Link
        href={href(filters, {
          metric,
          direction: selected && filters.direction === "desc" ? "asc" : "desc",
        })}
        aria-label={`Sort ${label} ${selected && filters.direction === "desc" ? "ascending" : "descending"}`}
        className={cn(
          "inline-flex items-center justify-end gap-1.5 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4",
          selected && "text-foreground",
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </Link>
    </th>
  );
}
