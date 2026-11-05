"use client";
import { trackEvent } from "@/lib/analytics-events";

import { API_BASE_URL } from "@/lib/api-base";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  GitCompareArrows,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollectionViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";
import { SelectionActionBar } from "@/components/dashboard/dashboard-workbench";
import { ChartJsChart } from "@/components/charts/chartjs-chart";
import { CompareDrawer } from "@/components/comparison/compare-drawer";
import { dashboardActorComparisonHref } from "@/components/comparison/comparison-paths";
import { cn } from "@/lib/utils";
import { KeywordComparison } from "./keyword-comparison";
import { KeywordResultCard, KeywordTrend } from "./keyword-result-card";
import {
  actorKey,
  filterKeywordResults,
  keywordFunnel,
  type KeywordResult,
  type KeywordSort,
} from "./keyword-research-model";

interface WatchItem {
  id: string;
  keyword: string;
  latestResultCount: number;
}
interface SearchMeta {
  searchVolume: number;
  difficultyScore: number;
  repeatUseRate: number | null;
  methodology: string;
}
interface Props {
  actors: Array<{ id: string; actorName: string; username: string }>;
}

const format = new Intl.NumberFormat("en-US");

function researchTakeaway(meta: SearchMeta | null, resultCount: number) {
  if (!resultCount)
    return "No matching Store listings were found in this snapshot. Try a broader term or a related problem your customers search for.";
  if (!meta)
    return "Review the matching Actors below to understand the competition for this topic.";
  const competition =
    meta.difficultyScore >= 70
      ? "Competition is high"
      : meta.difficultyScore <= 35
        ? "Competition is relatively low"
        : "Competition is moderate";
  const repeatUse =
    meta.repeatUseRate == null
      ? "Repeat use data is unavailable"
      : meta.repeatUseRate >= 40
        ? "observed repeat use is strong"
        : meta.repeatUseRate < 15
          ? "observed repeat use is limited"
          : "observed repeat use is mixed";
  return `${competition} among these Store results, and ${repeatUse}. Compare the listings below before choosing what to build.`;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0 border border-border/75 bg-background px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

export function KeywordResearch({ actors }: Props) {
  const [q, setQ] = useState("");
  const [searchedKeyword, setSearchedKeyword] = useState("");
  const [results, setResults] = useState<KeywordResult[] | null>(null);
  const [meta, setMeta] = useState<SearchMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<WatchItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<CollectionViewMode>("grid");
  const [sort, setSort] = useState<KeywordSort>("relevance");
  const [minOpportunity, setMinOpportunity] = useState(0);
  const [hideTracked, setHideTracked] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareHydrated, setCompareHydrated] = useState(false);
  const searchSequence = useRef(0);

  const trackedByKey = useMemo(
    () =>
      new Map(
        actors.map((actor) => [`${actor.username}/${actor.actorName}`.toLowerCase(), actor.id]),
      ),
    [actors],
  );
  const trackedKeys = useMemo(() => new Set(trackedByKey.keys()), [trackedByKey]);
  const visibleResults = useMemo(
    () => filterKeywordResults(results ?? [], { sort, minOpportunity, hideTracked, trackedKeys }),
    [results, sort, minOpportunity, hideTracked, trackedKeys],
  );
  const funnel = useMemo(() => keywordFunnel(results ?? [], trackedKeys), [results, trackedKeys]);
  const compared = useMemo(
    () => compareIds.flatMap((id) => (results ?? []).filter((result) => result.id === id)),
    [compareIds, results],
  );

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem("actorconsole:keyword-comparison");
      if (stored) {
        const parsed = JSON.parse(stored) as {
          keyword?: string;
          results?: KeywordResult[];
          available?: KeywordResult[];
          meta?: SearchMeta | null;
        };
        if (Array.isArray(parsed.results) && parsed.results.length) {
          const available = Array.isArray(parsed.available) ? parsed.available : parsed.results;
          const availableIds = new Set(available.map((result) => result.id));
          setResults(available);
          setCompareIds(
            parsed.results
              .map((result) => result.id)
              .filter((id) => availableIds.has(id))
              .slice(0, 5),
          );
          setSearchedKeyword(parsed.keyword ?? "");
          setQ(parsed.keyword ?? "");
          setMeta(parsed.meta ?? null);
        }
      }
    } catch {
      window.sessionStorage.removeItem("actorconsole:keyword-comparison");
    }
    setCompareHydrated(true);
  }, []);

  useEffect(() => {
    if (!compareHydrated) return;
    if (compared.length) {
      window.sessionStorage.setItem(
        "actorconsole:keyword-comparison",
        JSON.stringify({
          keyword: searchedKeyword,
          results: compared,
          available: results ?? [],
          meta,
        }),
      );
    } else {
      window.sessionStorage.removeItem("actorconsole:keyword-comparison");
    }
  }, [compared, searchedKeyword, results, meta, compareHydrated]);
  const currentWatch = saved.find(
    (item) => item.keyword.toLowerCase() === searchedKeyword.toLowerCase(),
  );

  useEffect(() => {
    if (window.localStorage.getItem("actorconsole:keyword-results-view") === "list")
      setView("list");
    fetch(`${API_BASE_URL}/keywords/watchlist`, { credentials: "include" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
        setSaved(body.data ?? []);
      })
      .catch(() => {
        /* Search works without the optional watchlist feature. */
      });
  }, []);

  function changeView(nextView: CollectionViewMode) {
    setView(nextView);
    window.localStorage.setItem("actorconsole:keyword-results-view", nextView);
  }

  async function runSearch(keyword = q) {
    const term = keyword.trim();
    if (!term) return;
    const sequence = ++searchSequence.current;
    setQ(term);
    setLoading(true);
    setCompareIds([]);
    setCompareOpen(false);
    try {
      const response = await fetch(
        `${API_BASE_URL}/keywords/search?q=${encodeURIComponent(term)}&limit=20`,
        { credentials: "include" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      if (sequence !== searchSequence.current) return;
      setSearchedKeyword(term);
      setResults(body.data ?? []);
      setMeta(body.meta ?? null);
      void trackEvent("keyword_search", { result_count: body.data?.length ?? 0 });
    } catch (error) {
      if (sequence !== searchSequence.current) return;
      toast.error(error instanceof Error ? error.message : "Keyword search failed");
    } finally {
      if (sequence === searchSequence.current) setLoading(false);
    }
  }

  async function toggleSaved(keyword: string) {
    const existing = saved.find((item) => item.keyword.toLowerCase() === keyword.toLowerCase());
    setSaving(true);
    try {
      const response = await fetch(
        existing
          ? `${API_BASE_URL}/keywords/watchlist/${existing.id}`
          : `${API_BASE_URL}/keywords/watchlist`,
        existing
          ? { method: "DELETE", credentials: "include" }
          : {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ keyword }),
            },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      setSaved((previous) =>
        existing
          ? previous.filter((item) => item.id !== existing.id)
          : [body.data, ...previous.filter((item) => item.id !== body.data.id)],
      );
      void trackEvent("watchlist_updated", {
        item_type: "keyword", action: existing ? "removed" : "added",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the watchlist");
    } finally {
      setSaving(false);
    }
  }

  function toggleCompare(id: string) {
    setCompareIds((previous) => {
      if (previous.includes(id)) return previous.filter((item) => item !== id);
      if (previous.length >= 5) {
        toast.info("Compare up to five Actors at a time");
        return previous;
      }
      return [...previous, id];
    });
  }

  function openComparison() {
    setCompareOpen(true);
  }

  return (
    <div className="space-y-7">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
        className="flex flex-col gap-2 sm:flex-row"
        role="search"
      >
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="keyword-search-input"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search an idea, market, or Actor category"
            aria-label="Keyword to research"
            className="h-11 pl-10"
            maxLength={120}
          />
        </div>
        <Button type="submit" disabled={loading || !q.trim()} className="h-11 px-5">
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Research keyword
        </Button>
      </form>

      {saved.length > 0 ? (
        <section aria-label="Saved keywords" className="border-t border-border/70 pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BookmarkCheck className="h-4 w-4 text-signal-orange" /> Watchlist{" "}
              <span className="font-normal text-muted-foreground">{saved.length}</span>
            </h2>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Select a keyword to refresh its signals
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {saved.map((watch) => (
              <div
                key={watch.id}
                className="inline-flex items-center border border-border bg-background text-xs"
              >
                <button
                  type="button"
                  onClick={() => void runSearch(watch.keyword)}
                  className="px-3 py-2 font-medium text-foreground hover:bg-muted"
                >
                  {watch.keyword}
                  {watch.latestResultCount > 0 ? (
                    <span className="ml-2 tabular-nums text-muted-foreground">
                      {watch.latestResultCount}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleSaved(watch.keyword)}
                  disabled={saving}
                  className="border-l border-border px-2 py-2 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${watch.keyword} from watchlist`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {loading ? (
        <div
          className="flex items-center gap-3 border-y border-border/70 py-8 text-sm text-muted-foreground"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Researching Store listings…
        </div>
      ) : results === null ? (
        <section className="border border-border/70 bg-muted/15 px-5 py-8 sm:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-signal-orange">
            Start with a market
          </p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">
            Find the gap before you build.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Search a topic to see competing Actors, observed demand, opportunity scores, and the
            listings already in your workspace.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {["facebook", "google maps", "ecommerce"].map((term) => (
              <button
                type="button"
                key={term}
                onClick={() => void runSearch(term)}
                className="hover:border-signal-orange/70 inline-flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-xs text-foreground transition-colors"
              >
                {term} <ArrowRight className="h-3 w-3" />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="space-y-7" aria-live="polite">
          <section aria-label="Keyword signals">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-signal-orange">
                  Demand snapshot
                </p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">{searchedKeyword}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Signals from the current Store catalog and available history
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void toggleSaved(searchedKeyword)}
              >
                {currentWatch ? (
                  <BookmarkCheck className="mr-2 h-4 w-4" />
                ) : (
                  <Bookmark className="mr-2 h-4 w-4" />
                )}
                {currentWatch ? "Saved keyword" : "Save keyword"}
              </Button>
            </div>
            <div className="grid gap-px bg-border/70 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Top Store results"
                value={format.format(results.length)}
                note="Up to 20 catalog listings"
              />
              <Metric
                label="Keyword difficulty"
                value={`${meta?.difficultyScore ?? 0}/100`}
                note="Competition within these results"
              />
              <Metric
                label="Repeat use signal"
                value={meta?.repeatUseRate == null ? "—" : `${meta.repeatUseRate}%`}
                note="30-day users ÷ total users"
              />
              <Metric
                label="Workspace searches"
                value={format.format(meta?.searchVolume ?? 0)}
                note="Searches for this term here"
              />
            </div>
            <div className="border-t border-border/70 bg-background px-4 py-4 sm:px-5">
              <p className="text-sm font-semibold">What this search suggests</p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                {researchTakeaway(meta, results.length)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Scores describe this Store snapshot. They do not predict revenue.
              </p>
            </div>
          </section>

          {results.length > 0 ? (
            <section className="border-t border-border/70 pt-5" aria-label="Opportunity funnel">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    How the results narrow down
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Each step narrows the same set of returned listings.
                  </p>
                </div>
                <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
                  TOP {results.length} RESULTS
                </span>
              </div>
              <ChartJsChart
                ariaLabel="Opportunity funnel by research stage"
                data={funnel.map((step, index) => ({
                  ...step,
                  color: index === 3 ? "var(--color-signal-green)" : "var(--color-signal-orange)",
                }))}
                xKey="label"
                series={[
                  {
                    key: "count",
                    label: "Listings",
                    color: "var(--color-signal-orange)",
                    colorKey: "color",
                  },
                ]}
                type="bar"
                horizontal
                height={220}
                showDataLabels
                yAxis={{ min: 0, max: results.length, integer: true }}
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {funnel.map((step, index) => (
                  <div
                    key={step.label}
                    className="border border-border/70 bg-background px-3.5 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        0{index + 1}
                      </span>
                      <span className="text-lg font-semibold tabular-nums text-foreground">
                        {step.count}
                      </span>
                    </div>
                    <p className="mt-2.5 text-xs font-semibold text-foreground">{step.label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{step.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section aria-label="Keyword results" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Competing Actors</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {visibleResults.length} of {results.length} listings shown
                </p>
              </div>
              {results.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    aria-expanded={filtersOpen}
                  >
                    <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> Filter &amp; sort
                    {minOpportunity || hideTracked || sort !== "relevance" ? (
                      <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-signal-orange" />
                    ) : null}
                  </Button>
                  <ViewModeToggle
                    value={view}
                    onValueChange={changeView}
                    label="Keyword results view"
                  />
                </div>
              ) : null}
            </div>
            {filtersOpen && results.length > 0 ? (
              <div className="flex flex-wrap items-end gap-4 border border-border/70 bg-muted/20 p-4">
                <label className="flex min-w-44 flex-col gap-1.5 text-xs text-muted-foreground">
                  Sort by
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as KeywordSort)}
                    className="h-9 border border-border bg-background px-2.5 text-xs text-foreground"
                  >
                    <option value="relevance">Search relevance</option>
                    <option value="opportunity">Highest opportunity</option>
                    <option value="monthlyUsers">Most 30-day users</option>
                    <option value="totalRuns">Most total runs</option>
                  </select>
                </label>
                <label className="flex min-w-44 flex-col gap-1.5 text-xs text-muted-foreground">
                  Minimum opportunity
                  <select
                    value={minOpportunity}
                    onChange={(event) => setMinOpportunity(Number(event.target.value))}
                    className="h-9 border border-border bg-background px-2.5 text-xs text-foreground"
                  >
                    <option value={0}>All scores</option>
                    <option value={40}>40+</option>
                    <option value={60}>60+</option>
                    <option value={70}>70+</option>
                  </select>
                </label>
                <label className="flex h-9 cursor-pointer items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={hideTracked}
                    onChange={(event) => setHideTracked(event.target.checked)}
                    className="h-4 w-4 accent-signal-orange"
                  />
                  Hide workspace Actors
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSort("relevance");
                    setMinOpportunity(0);
                    setHideTracked(false);
                  }}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
                </Button>
              </div>
            ) : null}
            {results.length === 0 ? (
              <div className="border border-border/70 py-10 text-center text-sm text-muted-foreground">
                No Store listings matched “{searchedKeyword}”. Try a broader term.
              </div>
            ) : visibleResults.length === 0 ? (
              <div className="border border-border/70 py-10 text-center text-sm text-muted-foreground">
                No listings match these options. Clear the filters to see all results.
              </div>
            ) : view === "grid" ? (
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {visibleResults.map((result) => (
                  <KeywordResultCard
                    key={result.id}
                    result={result}
                    trackedId={trackedByKey.get(actorKey(result))}
                    selected={compareIds.includes(result.id)}
                    onSelect={() => toggleCompare(result.id)}
                  />
                ))}
              </div>
            ) : (
              <>
                <div className="grid gap-3 lg:hidden">
                  {visibleResults.map((result) => (
                    <KeywordResultCard
                      key={result.id}
                      result={result}
                      trackedId={trackedByKey.get(actorKey(result))}
                      selected={compareIds.includes(result.id)}
                      onSelect={() => toggleCompare(result.id)}
                    />
                  ))}
                </div>
                <div className="hidden overflow-x-auto border border-border/70 lg:block">
                  <table className="w-full min-w-[850px] text-left text-xs">
                    <thead className="border-b border-border/70 bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="w-10 px-3 py-3 font-medium">
                          <span className="sr-only">Compare</span>
                        </th>
                        <th className="px-3 py-3 font-medium">Actor</th>
                        <th className="px-3 py-3 text-right font-medium">30-day users</th>
                        <th className="px-3 py-3 text-right font-medium">Total runs</th>
                        <th className="px-3 py-3 text-right font-medium">Opportunity</th>
                        <th className="px-3 py-3 text-right font-medium">Difficulty</th>
                        <th className="px-3 py-3 text-right font-medium">History</th>
                        <th className="px-3 py-3 text-right font-medium">View</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleResults.map((result) => (
                        <tr
                          key={result.id}
                          className={cn(
                            "border-b border-border/60 last:border-b-0",
                            compareIds.includes(result.id) && "bg-signal-orange/[0.05]",
                          )}
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={compareIds.includes(result.id)}
                              onChange={() => toggleCompare(result.id)}
                              aria-label={`Compare ${result.title ?? result.name}`}
                              className="h-4 w-4 accent-signal-orange"
                            />
                          </td>
                          <td className="max-w-[360px] px-3 py-3">
                            <p className="truncate font-semibold text-foreground">
                              {result.title ?? result.name}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                              @{result.username}/{result.name}
                            </p>
                            {trackedByKey.has(actorKey(result)) ? (
                              <span className="mt-1 inline-block text-[10px] text-signal-green">
                                In workspace
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {result.monthlyUsers == null ? "—" : format.format(result.monthlyUsers)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {result.totalRuns == null ? "—" : format.format(result.totalRuns)}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums text-foreground">
                            {result.opportunityScore ?? "—"}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {result.difficultyScore ?? "—"}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <KeywordTrend value={result.demandTrendPercent} />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <a
                              href={`https://apify.com/${encodeURIComponent(result.username)}/${encodeURIComponent(result.name)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-foreground hover:underline"
                              aria-label={`View ${result.title ?? result.name} on Apify`}
                            >
                              <ExternalLink className="ml-auto h-3.5 w-3.5" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4 text-[11px] text-muted-foreground">
            <details className="max-w-3xl">
              <summary className="cursor-pointer font-medium hover:text-foreground">
                How these signals are calculated
              </summary>
              <p className="mt-2 leading-5">
                {meta?.methodology ?? "Store metrics reflect the available catalog data."}
              </p>
            </details>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/actors"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                Actor portfolio <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href="/dashboard/revenue"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                Revenue analysis <TrendingUp className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {compareIds.length > 0 ? <div className="h-20" aria-hidden="true" /> : null}
      {compareIds.length > 0
        ? createPortal(
            <SelectionActionBar
              count={compareIds.length}
              noun="Actor"
              description="Select up to five listings to compare their Store signals."
              className="!fixed !bottom-3 !left-1/2 !top-auto z-40 w-[calc(100%-1.5rem)] max-w-5xl !-translate-x-1/2 shadow-xl md:!ml-[124px] md:w-[calc(100%-280px)] lg:!bottom-5"
              onClear={() => {
                setCompareIds([]);
                setCompareOpen(false);
              }}
            >
              <Button type="button" size="sm" onClick={openComparison}>
                <GitCompareArrows className="mr-1.5 h-4 w-4" /> Compare selected
              </Button>
            </SelectionActionBar>,
            document.body,
          )
        : null}
      <CompareDrawer
        open={compareOpen && compared.length > 0}
        onOpenChange={setCompareOpen}
        title="Compare Actors"
        description="Store metrics are observed. Opportunity and difficulty are ActorConsole estimates."
        count={compared.length}
        fullHref={dashboardActorComparisonHref(
          compared.map((result) => `${result.username}/${result.name}`),
          searchedKeyword,
        )}
      >
        <KeywordComparison
          results={compared}
          available={results ?? []}
          onAdd={(result) =>
            setCompareIds((previous) =>
              previous.includes(result.id) || previous.length >= 5
                ? previous
                : [...previous, result.id],
            )
          }
          onRemove={(id) => setCompareIds((previous) => previous.filter((item) => item !== id))}
        />
      </CompareDrawer>
    </div>
  );
}
