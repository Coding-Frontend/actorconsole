"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ComparisonPanel } from "@/components/comparison/comparison-panel";
import type { ComparisonItem, ComparisonRow } from "@/components/comparison/comparison-ui";
import type { PublicCompareItem } from "@/components/comparison/public-comparison-items";
import { actorKey, type KeywordResult } from "./keyword-research-model";

export const keywordComparisonRows: ComparisonRow[] = [
  { key: "description", label: "What it does", group: "Listing", format: "text" },
  {
    key: "opportunityScore",
    label: "Opportunity score",
    group: "Opportunity",
    format: "score",
    better: "higher",
  },
  {
    key: "difficultyScore",
    label: "Difficulty",
    group: "Opportunity",
    format: "score",
    better: "lower",
  },
  { key: "monthlyUsers", label: "30-day users", group: "Demand", better: "higher" },
  { key: "usersTotal", label: "Total users", group: "Demand", better: "higher" },
  { key: "totalRuns", label: "Total runs", group: "Demand", better: "higher" },
  {
    key: "demandTrendPercent",
    label: "History trend",
    group: "Demand",
    format: "percent",
    better: "higher",
  },
  { key: "rating", label: "Rating", group: "Trust", format: "rating", better: "higher" },
  { key: "reviewCount", label: "Reviews", group: "Trust", better: "higher" },
  { key: "bookmarkCount", label: "Bookmarks", group: "Trust", better: "higher" },
];

export function keywordComparisonItems(results: KeywordResult[]): ComparisonItem[] {
  return results.map((result) => ({
    id: result.id,
    title: result.title ?? result.name,
    subtitle: `@${result.username}/${result.name}`,
    href: `https://apify.com/${encodeURIComponent(result.username)}/${encodeURIComponent(result.name)}`,
    imageUrl: result.pictureUrl,
    metrics: Object.fromEntries(
      keywordComparisonRows.map((row) => [
        row.key,
        (result[row.key as keyof KeywordResult] as number | string | null | undefined) ?? null,
      ]),
    ),
  }));
}

export function KeywordComparison({
  results,
  onRemove,
  available = [],
  onAdd,
  presentation = "matrix",
}: {
  results: KeywordResult[];
  onRemove?: (id: string) => void;
  available?: KeywordResult[];
  onAdd?: (result: KeywordResult) => void;
  presentation?: "matrix" | "columns";
}) {
  const [query, setQuery] = useState("");
  const [publicSuggestions, setPublicSuggestions] = useState<KeywordResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    if (presentation !== "columns" || query.trim().length < 2 || results.length >= 5) {
      setPublicSuggestions([]);
      setSearchError("");
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => {
      setSearching(true);
      const params = new URLSearchParams({ kind: "actor", q: query.trim(), window: "30" });
      fetch(`/api/public/comparison/search?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? "Could not search the Actor catalog");
          setPublicSuggestions(
            (body.items as PublicCompareItem[]).map((item) => ({
              id: item.id,
              username: item.username,
              name: item.actorName ?? "",
              title: item.title,
              description:
                typeof item.metrics.description === "string" ? item.metrics.description : null,
              pictureUrl: item.imageUrl,
              monthlyUsers:
                typeof item.metrics.users30Days === "number" ? item.metrics.users30Days : null,
              usersTotal:
                typeof item.metrics.totalUsers === "number" ? item.metrics.totalUsers : null,
              totalRuns: typeof item.metrics.totalRuns === "number" ? item.metrics.totalRuns : null,
              rating: typeof item.metrics.rating === "number" ? item.metrics.rating : null,
              reviewCount:
                typeof item.metrics.reviewCount === "number" ? item.metrics.reviewCount : null,
              bookmarkCount:
                typeof item.metrics.bookmarks === "number" ? item.metrics.bookmarks : null,
            })),
          );
          setSearchError("");
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setSearchError(
              error instanceof Error ? error.message : "Could not search the Actor catalog",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [presentation, query, results.length]);

  const candidates = useMemo(() => {
    const selected = new Set(results.map(actorKey));
    const term = query.trim().toLocaleLowerCase();
    if (presentation === "columns" && term.length < 2) return [];
    const unique = new Map(
      [...publicSuggestions, ...available].map((result) => [actorKey(result), result]),
    );
    return [...unique.values()]
      .filter((result) => !selected.has(actorKey(result)))
      .filter(
        (result) =>
          !term ||
          `${result.title ?? result.name} ${result.username}/${result.name}`
            .toLocaleLowerCase()
            .includes(term),
      )
      .slice(0, 5);
  }, [available, publicSuggestions, presentation, query, results]);

  return (
    <div className="space-y-5">
      {onAdd && (available.length || presentation === "columns") ? (
        <section
          className={
            presentation === "columns"
              ? "border-border relative z-20 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between"
              : "border-border bg-card border px-4 py-4"
          }
          aria-label="Add an Actor to comparison"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Add another Actor</p>
            <span className="text-muted-foreground text-xs">{results.length} of 5 selected</span>
          </div>
          <div
            className={
              presentation === "columns" ? "relative w-full sm:max-w-md" : "relative mt-3 block"
            }
          >
            <Search
              className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={results.length >= 5}
              aria-label="Search Actors to compare"
              placeholder={
                presentation === "columns" ? "Search the Actor catalog" : "Search these results"
              }
              className="pl-9"
            />
          </div>
          {results.length >= 5 ? (
            <p className="text-muted-foreground mt-2 text-xs">Remove one Actor to add another.</p>
          ) : searchError ? (
            <p className="text-destructive mt-2 text-xs" role="alert">
              {searchError}
            </p>
          ) : searching ? (
            <p className="text-muted-foreground mt-2 text-xs" role="status">
              Searching Actors…
            </p>
          ) : candidates.length ? (
            <ul
              className={
                presentation === "columns"
                  ? "border-border bg-card absolute right-0 top-full z-30 mt-1 max-h-72 w-full divide-y overflow-auto border px-3 shadow-xl sm:max-w-md"
                  : "border-border mt-3 divide-y border-t"
              }
            >
              {candidates.map((candidate) => (
                <li key={candidate.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {candidate.title ?? candidate.name}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      @{candidate.username}/{candidate.name}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAdd(candidate)}
                    aria-label={`Add ${candidate.title ?? candidate.name} to comparison`}
                  >
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-2 text-xs">
              {query.trim().length < 2 && presentation === "columns"
                ? "Search the catalog to add another Actor."
                : "No more matching Actors found."}
            </p>
          )}
        </section>
      ) : null}
      {results.length ? (
        <ComparisonPanel
          items={keywordComparisonItems(results)}
          rows={keywordComparisonRows}
          onRemove={onRemove}
          ariaLabel="Actor comparison"
          presentation={presentation}
        />
      ) : (
        <p className="border-border bg-muted/20 border px-4 py-6 text-sm">
          Choose an Actor above to start comparing.
        </p>
      )}
    </div>
  );
}
