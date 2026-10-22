"use client";

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
    <div className="border-border/75 bg-background min-w-0 border px-4 py-3.5">
      <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-[0.12em]">
        {label}
      </p>
      <p className="text-foreground mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{note}</p>
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
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
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
        <section aria-label="Saved keywords" className="border-border/70 border-t pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-foreground flex items-center gap-2 text-sm font-semibold">
              <BookmarkCheck className="text-signal-orange h-4 w-4" /> Watchlist{" "}
              <span className="text-muted-foreground font-normal">{saved.length}</span>
            </h2>
            <span className="text-muted-foreground hidden text-xs sm:inline">
              Select a keyword to refresh its signals
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {saved.map((watch) => (
              <div
                key={watch.id}
                className="border-border bg-background inline-flex items-center border text-xs"
              >
                <button
                  type="button"
                  onClick={() => void runSearch(watch.keyword)}
                  className="text-foreground hover:bg-muted px-3 py-2 font-medium"
                >
                  {watch.keyword}
                  {watch.latestResultCount > 0 ? (
                    <span className="text-muted-foreground ml-2 tabular-nums">
                      {watch.latestResultCount}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleSaved(watch.keyword)}
                  disabled={saving}
                  className="text-muted-foreground hover:text-foreground border-border border-l px-2 py-2"
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
          className="border-border/70 text-muted-foreground flex items-center gap-3 border-y py-8 text-sm"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Researching Store listings…
        </div>
      ) : results === null ? (
        <section className="border-border/70 bg-muted/15 border px-5 py-8 sm:px-8">
          <p className="text-signal-orange font-mono text-[11px] uppercase tracking-[0.14em]">
            Start with a market
          </p>
          <h2 className="text-foreground mt-2 text-xl font-semibold">
            Find the gap before you build.
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Search a topic to see competing Actors, observed demand, opportunity scores, and the
            listings already in your workspace.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {["facebook", "google maps", "ecommerce"].map((term) => (
              <button
                type="button"
                key={term}
                onClick={() => void runSearch(term)}
                className="border-border bg-card text-foreground hover:border-signal-orange/70 inline-flex items-center gap-1.5 border px-3 py-2 text-xs transition-colors"
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
                <p className="text-signal-orange font-mono text-[11px] uppercase tracking-[0.14em]">
                  Demand snapshot
                </p>
                <h2 className="text-foreground mt-1 text-xl font-semibold">{searchedKeyword}</h2>
                <p className="text-muted-foreground mt-1 text-xs">
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
            <div className="bg-border/70 grid gap-px sm:grid-cols-2 xl:grid-cols-4">
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
            <div className="border-border/70 bg-background border-t px-4 py-4 sm:px-5">
              <p className="text-sm font-semibold">What this search suggests</p>
              <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-6">
                {researchTakeaway(meta, results.length)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Scores describe this Store snapshot. They do not predict revenue.
              </p>
            </div>
          </section>

          {results.length > 0 ? (
            <section className="border-border/70 border-t pt-5" aria-label="Opportunity funnel">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-foreground text-sm font-semibold">
                    How the results narrow down
                  </h2>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Each step narrows the same set of returned listings.
                  </p>
                </div>
                <span className="text-muted-foreground hidden font-mono text-[11px] sm:inline">
                  TOP {results.length} RESULTS
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {funnel.map((step, index) => (
                  <div
                    key={step.label}
                    className="border-border/70 bg-background border px-3.5 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground font-mono text-[10px]">
                        0{index + 1}
                      </span>
                      <span className="text-foreground text-lg font-semibold tabular-nums">
                        {step.count}
                      </span>
                    </div>
                    <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                      <div
                        className={cn(
                          "h-full",
                          index === 3 ? "bg-signal-green" : "bg-signal-orange",
                        )}
                        style={{ width: `${(step.count / results.length) * 100}%` }}
                      />
                    </div>
                    <p className="text-foreground mt-2.5 text-xs font-semibold">{step.label}</p>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">{step.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section aria-label="Keyword results" className="space-y-4">
            <div className="border-border/70 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <div>
                <h2 className="text-foreground text-sm font-semibold">Competing Actors</h2>
                <p className="text-muted-foreground mt-0.5 text-xs">
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
                      <span className="bg-signal-orange ml-1.5 h-1.5 w-1.5 rounded-full" />
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
              <div className="border-border/70 bg-muted/20 flex flex-wrap items-end gap-4 border p-4">
                <label className="text-muted-foreground flex min-w-44 flex-col gap-1.5 text-xs">
                  Sort by
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as KeywordSort)}
                    className="border-border bg-background text-foreground h-9 border px-2.5 text-xs"
                  >
                    <option value="relevance">Search relevance</option>
                    <option value="opportunity">Highest opportunity</option>
                    <option value="monthlyUsers">Most 30-day users</option>
                    <option value="totalRuns">Most total runs</option>
                  </select>
                </label>
                <label className="text-muted-foreground flex min-w-44 flex-col gap-1.5 text-xs">
                  Minimum opportunity
                  <select
                    value={minOpportunity}
                    onChange={(event) => setMinOpportunity(Number(event.target.value))}
                    className="border-border bg-background text-foreground h-9 border px-2.5 text-xs"
                  >
                    <option value={0}>All scores</option>
                    <option value={40}>40+</option>
                    <option value={60}>60+</option>
                    <option value={70}>70+</option>
                  </select>
                </label>
                <label className="text-foreground flex h-9 cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={hideTracked}
                    onChange={(event) => setHideTracked(event.target.checked)}
                    className="accent-signal-orange h-4 w-4"
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
              <div className="border-border/70 text-muted-foreground border py-10 text-center text-sm">
                No Store listings matched “{searchedKeyword}”. Try a broader term.
              </div>
            ) : visibleResults.length === 0 ? (
              <div className="border-border/70 text-muted-foreground border py-10 text-center text-sm">
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
                <div className="border-border/70 hidden overflow-x-auto border lg:block">
                  <table className="w-full min-w-[850px] text-left text-xs">
                    <thead className="bg-muted/40 text-muted-foreground border-border/70 border-b">
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
                            "border-border/60 border-b last:border-b-0",
                            compareIds.includes(result.id) && "bg-signal-orange/[0.05]",
                          )}
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={compareIds.includes(result.id)}
                              onChange={() => toggleCompare(result.id)}
                              aria-label={`Compare ${result.title ?? result.name}`}
                              className="accent-signal-orange h-4 w-4"
                            />
                          </td>
                          <td className="max-w-[360px] px-3 py-3">
                            <p className="text-foreground truncate font-semibold">
                              {result.title ?? result.name}
                            </p>
                            <p className="text-muted-foreground mt-0.5 truncate font-mono text-[10px]">
                              @{result.username}/{result.name}
                            </p>
                            {trackedByKey.has(actorKey(result)) ? (
                              <span className="text-signal-green mt-1 inline-block text-[10px]">
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
                          <td className="text-foreground px-3 py-3 text-right font-semibold tabular-nums">
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

          <div className="border-border/70 text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-[11px]">
            <details className="max-w-3xl">
              <summary className="hover:text-foreground cursor-pointer font-medium">
                How these signals are calculated
              </summary>
              <p className="mt-2 leading-5">
                {meta?.methodology ?? "Store metrics reflect the available catalog data."}
              </p>
            </details>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/actors"
                className="hover:text-foreground inline-flex items-center gap-1"
              >
                Actor portfolio <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href="/dashboard/revenue"
                className="hover:text-foreground inline-flex items-center gap-1"
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
