import { EarningsBand, EarningsMethod } from "./earnings-summary";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublicCompareButton } from "@/components/comparison/public-comparison-provider";
import type { PublicCompareItem } from "@/components/comparison/public-comparison-items";
import { pricingEntries } from "@/lib/builders";
import { WatchButton } from "./watch-button";
import {
  categoryNames,
  getActorResearch,
  getResearchCategories,
  researchSorts,
  type ResearchFilters,
} from "@/lib/actor-research";

const number = (value: number | null) =>
  value == null
    ? "Unavailable"
    : new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const selectClass =
  "h-10 w-full rounded-sm border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export async function ActorResearchView({
  filters,
  path,
}: {
  filters: ResearchFilters;
  path: string;
}) {
  const seoPath = path.startsWith("/dashboard/") ? "/dashboard/tools/seo" : "/tools/seo";
  const [result, categories] = await Promise.all([
    getActorResearch(filters).catch(() => null),
    getResearchCategories().catch(() => [] as string[]),
  ]);
  const categoryOptions = [...new Set([...categories, filters.category])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const href = (page: number) =>
    `${path}?${new URLSearchParams({ q: filters.query, category: filters.category, sort: filters.sort, window: String(filters.window), page: String(page) })}`;
  return (
    <div className="space-y-8">
      <form
        action={path}
        className="border-border grid items-end gap-4 border-y py-5 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
      >
        <label htmlFor="research-query" className="space-y-2 text-sm font-medium">
          Search Actors
          <Input
            name="q"
            id="research-query"
            defaultValue={filters.query}
            placeholder="Actor, builder, or use case"
            maxLength={100}
          />
        </label>
        <label htmlFor="research-category" className="space-y-2 text-sm font-medium">
          Category
          <select
            name="category"
            id="research-category"
            defaultValue={filters.category}
            className={selectClass}
          >
            <option value="">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category
                  .replaceAll("_", " ")
                  .toLowerCase()
                  .replace(/\b\w/g, (letter) => letter.toUpperCase())}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium">
          Order by
          <select name="sort" defaultValue={filters.sort} className={selectClass}>
            {Object.entries(researchSorts).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium">
          User window
          <select name="window" defaultValue={filters.window} className={selectClass}>
            {[7, 30, 90].map((window) => (
              <option key={window} value={window}>
                {window} days
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Search</Button>
      </form>
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-sm">
        <p>{result ? `${result.total.toLocaleString()} matching Actors` : "Catalog unavailable"}</p>
        <Link href={seoPath} className="underline underline-offset-4">
          Audit a listing
        </Link>
      </div>
      {!result ? (
        <div role="alert" className="border-border border p-8">
          <h2 className="text-lg font-semibold">The public catalog could not load.</h2>
          <p className="text-muted-foreground mt-2">
            Try again shortly. Your search filters are saved in this URL.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={href(filters.page)}>Retry search</Link>
          </Button>
        </div>
      ) : !result.actors.length ? (
        <div className="border-border border p-8">
          <h2 className="text-lg font-semibold">No Actors match this search.</h2>
          <p className="text-muted-foreground mt-2">
            Try a broader term or clear the category filter.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={path}>Clear filters</Link>
          </Button>
        </div>
      ) : (
        <div className="divide-border border-border divide-y border-y">
          {result.actors.map((actor, index) => {
            const profile = `/builders/${encodeURIComponent(actor.username)}/actors/${encodeURIComponent(actor.actorName)}`;
            const activeUsers =
              filters.window === 7
                ? actor.users7Days
                : filters.window === 90
                  ? actor.users90Days
                  : actor.users30Days;
            const pricing = pricingEntries(actor.pricingInfos).at(0);
            const primaryEvent =
              pricing?.events.find((event) => event.isPrimary) ?? pricing?.events[0];
            const price = primaryEvent?.priceUsd ?? pricing?.pricePerUnitUsd;
            const priceSummary =
              price != null
                ? `$${price.toLocaleString("en-US", { maximumFractionDigits: 6 })}${primaryEvent?.title || pricing?.unitName ? ` / ${primaryEvent?.title ?? pricing?.unitName}` : ""}`
                : null;
            const comparison: PublicCompareItem = {
              kind: "actor",
              id: `${actor.username}/${actor.actorName}`,
              username: actor.username,
              actorName: actor.actorName,
              title: actor.title ?? actor.actorName,
              subtitle: `@${actor.username}`,
              imageUrl: actor.pictureUrl,
              href: profile,
              window: filters.window as 7 | 30 | 90,
              metrics: {
                earningsLow: actor.earnings?.lowUsd ?? null,
                earningsCentral: actor.earnings?.centralUsd ?? null,
                earningsHigh: actor.earnings?.highUsd ?? null,
                earningsReason: actor.earnings?.reason ?? "Public scenarios before costs",
                description: actor.description,
                categories: categoryNames(actor.categories),
                activeUsers,
                users7Days: actor.users7Days,
                users30Days: actor.users30Days,
                users90Days: actor.users90Days,
                totalUsers: actor.totalUsers,
                runs30Days: actor.runs30Days,
                totalRuns: actor.totalRuns,
                rating: actor.reviewRating,
                reviewCount: actor.reviewCount,
                pricingModel: pricing?.model ?? null,
                priceSummary,
              },
            };
            return (
              <article key={actor.id} className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {(filters.page - 1) * 24 + index + 1}
                    </span>
                    <h2 className="min-w-0 text-xl font-semibold">
                      <Link
                        href={profile}
                        className="break-words underline-offset-4 hover:underline"
                      >
                        {actor.title ?? actor.actorName}
                      </Link>
                    </h2>
                  </div>
                  <Link
                    href={`/builders/${encodeURIComponent(actor.username)}`}
                    className="text-muted-foreground mt-1 inline-block text-sm hover:underline"
                  >
                    @{actor.username}
                  </Link>
                  <p className="text-muted-foreground mt-3 line-clamp-2 max-w-[70ch] text-sm leading-6">
                    {actor.description || "No public description available."}
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {categoryNames(actor.categories).join(" · ")}
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {priceSummary ??
                      (pricing?.model
                        ? pricing.model.replaceAll("_", " ").toLowerCase()
                        : "Pricing unavailable")}
                    {actor.reviewRating != null
                      ? ` · ${actor.reviewRating.toFixed(1)}/5 (${actor.reviewCount ?? 0} reviews)`
                      : ""}
                    {` · Catalog ${new Date(actor.lastSeenAt).toLocaleDateString("en-IN")}`}
                  </p>
                </div>
                <div className="flex flex-col justify-between gap-4">
                  <dl className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground text-xs">Users / {filters.window}d</dt>
                      <dd className="mt-1 font-semibold tabular-nums">{number(activeUsers)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Runs / 30d</dt>
                      <dd className="mt-1 font-semibold tabular-nums">
                        {number(actor.runs30Days)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">
                        New users / ~{filters.window}d
                      </dt>
                      <dd className="mt-1 font-semibold tabular-nums">{number(actor.newUsers)}</dd>
                    </div>
                  </dl>
                  <div>
                    <p className="text-muted-foreground mb-2 text-xs">
                      Est. monthly creator revenue
                    </p>
                    <EarningsBand value={actor.earnings} compact />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <WatchButton storeActorId={actor.id} />
                    <PublicCompareButton item={comparison} />
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={`${seoPath}?actor=${encodeURIComponent(`${actor.username}/${actor.actorName}`)}`}
                      >
                        SEO audit
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {result && result.total > 24 && (
        <nav
          aria-label="Search pages"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <Button asChild variant="outline" disabled={filters.page <= 1}>
            <Link
              aria-disabled={filters.page <= 1}
              tabIndex={filters.page <= 1 ? -1 : undefined}
              href={href(Math.max(1, filters.page - 1))}
            >
              Previous
            </Link>
          </Button>
          <p className="text-muted-foreground text-sm">
            Page {filters.page} of {Math.ceil(result.total / 24)}
          </p>
          {filters.page * 24 < result.total && (
            <Button asChild variant="outline">
              <Link href={href(filters.page + 1)}>Next</Link>
            </Button>
          )}
        </nav>
      )}
      <p className="text-muted-foreground max-w-[75ch] text-xs leading-5">
        Public Store usage is a demand signal, not search volume or verified revenue. New users
        compares the all-time user count with the nearest snapshot within three days before the
        selected window. Missing history is shown as unavailable. Runs always cover 30 days. Catalog
        counts may lag Apify.
      </p>
      <EarningsMethod />
    </div>
  );
}
