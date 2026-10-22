"use client";

import { EarningsMethod } from "@/components/intelligence/earnings-summary";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BuilderWindow } from "@/lib/builders";
import { ComparisonPanel } from "./comparison-panel";
import { ComparisonWorkspace } from "./comparison-workspace";
import {
  actorComparisonRows,
  builderComparisonRows,
  publicComparisonHref,
  type PublicCompareItem,
  type PublicCompareKind,
} from "./public-comparison-items";

interface Props {
  items: PublicCompareItem[];
  kind: PublicCompareKind;
  window: BuilderWindow;
  mode: "drawer" | "page";
  onAdd?: (item: PublicCompareItem) => void;
  onRemove?: (id: string) => void;
  onReplace?: (kind: PublicCompareKind, items: PublicCompareItem[]) => void;
}

function comparisonApiHref(kind: PublicCompareKind, ids: string[], window: BuilderWindow) {
  const params = new URLSearchParams({ kind, window: String(window) });
  ids.forEach((id) => params.append("item", id));
  return `/api/public/comparison?${params.toString()}`;
}

export function PublicComparisonExplorer({
  items,
  kind,
  window,
  mode,
  onAdd,
  onRemove,
  onReplace,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PublicCompareItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [displayItems, setDisplayItems] = useState(items);
  const loadedKey = useRef("");
  const idsKey = items.map((item) => item.id).join("\n");
  const ids = useMemo(() => (idsKey ? idsKey.split("\n") : []), [idsKey]);
  const selected = useMemo(() => new Set(ids), [ids]);
  const rows = kind === "actor" ? actorComparisonRows : builderComparisonRows;

  useEffect(() => {
    setDisplayItems(items);
  }, [items]);

  useEffect(() => {
    const key = `${kind}:${window}:${idsKey}`;
    if (mode !== "drawer" || !ids.length || loadedKey.current === key) return;
    const controller = new AbortController();
    setRefreshing(true);
    setDetailError("");
    fetch(comparisonApiHref(kind, ids, window), { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load comparison details");
        return body as { items: PublicCompareItem[]; missing: number };
      })
      .then((body) => {
        loadedKey.current = key;
        setDisplayItems(body.items);
        onReplace?.(kind, body.items);
        if (body.missing)
          toast.info(
            `${body.missing} selected item${body.missing === 1 ? " is" : "s are"} no longer in the public catalog.`,
          );
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setDetailError(
            error instanceof Error ? error.message : "Could not load comparison details",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefreshing(false);
      });
    return () => controller.abort();
    // The ID signature prevents refetching when detail values are refreshed in context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, idsKey, window, mode]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || (items.length >= 5 && !replacementId)) {
      setSuggestions([]);
      setSearchError("");
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setSuggestions([]);
    setSearchError("");
    const timer = globalThis.setTimeout(() => {
      const params = new URLSearchParams({ kind, q: term, window: String(window) });
      fetch(`/api/public/comparison/search?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? "Could not search the catalog");
          setSuggestions(
            (body.items as PublicCompareItem[]).filter((item) => !selected.has(item.id)),
          );
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setSearchError(error instanceof Error ? error.message : "Could not search the catalog");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, kind, window, items.length, selected, replacementId]);

  function add(item: PublicCompareItem) {
    if (items.length >= 5 && !replacementId) return;
    if (mode === "page")
      router.push(
        publicComparisonHref(
          kind,
          replacementId
            ? ids.map((id) => (id === replacementId ? item.id : id))
            : [...ids, item.id],
          window,
        ),
        { scroll: false },
      );
    else onAdd?.(item);
    setQuery("");
    setSuggestions([]);
    setReplacementId(null);
  }

  function remove(id: string) {
    if (mode === "page")
      router.push(
        publicComparisonHref(
          kind,
          ids.filter((selectedId) => selectedId !== id),
          window,
        ),
        { scroll: false },
      );
    else onRemove?.(id);
  }

  async function changeWindow(next: BuilderWindow) {
    if (next === window || refreshing) return;
    if (mode === "page") {
      router.push(publicComparisonHref(kind, ids, next), { scroll: false });
      return;
    }
    setRefreshing(true);
    setDetailError("");
    try {
      const response = await fetch(comparisonApiHref(kind, ids, next), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not change the reporting period");
      loadedKey.current = `${kind}:${next}:${idsKey}`;
      setDisplayItems(body.items);
      onReplace?.(kind, body.items);
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Could not change the reporting period",
      );
    } finally {
      setRefreshing(false);
    }
  }

  const searchControl = (
    <section
      className={
        mode === "page"
          ? "relative z-20 w-full lg:max-w-md"
          : "border-border bg-card border px-4 py-4 sm:px-5"
      }
      aria-label={`Add ${kind === "actor" ? "an Actor" : "a builder"}`}
    >
      {mode === "drawer" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              Add {kind === "actor" ? "an Actor" : "a builder"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Search the public catalog without leaving this comparison.
            </p>
          </div>
          <span className="text-muted-foreground text-xs">{items.length} of 5 selected</span>
        </div>
      ) : null}
      <div className={mode === "page" ? "relative" : "relative mt-3 block"}>
        <Search
          className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={items.length >= 5 && !replacementId}
          aria-label={`Search ${kind === "actor" ? "Actors" : "builders"} to compare`}
          placeholder={kind === "actor" ? "Search Actor name or builder" : "Search builder name"}
          className="pl-9"
        />
      </div>
      {items.length >= 5 && !replacementId ? (
        <p className="text-muted-foreground mt-2 text-xs">Remove one item to add another.</p>
      ) : null}
      {query.trim().length === 1 ? (
        <p className="text-muted-foreground mt-2 text-xs">Type one more character to search.</p>
      ) : null}
      {searching ? (
        <p className="text-muted-foreground mt-2 flex items-center gap-2 text-xs" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
        </p>
      ) : null}
      {searchError ? (
        <p className="text-destructive mt-2 text-xs" role="alert">
          {searchError}
        </p>
      ) : null}
      {!searching && query.trim().length >= 2 && !searchError && suggestions.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">
          No more matching {kind === "actor" ? "Actors" : "builders"} found.
        </p>
      ) : null}
      {suggestions.length ? (
        <ul
          className={
            mode === "page" && !displayItems.length
              ? "border-border bg-card absolute left-0 right-0 top-full z-30 mt-1 max-h-72 divide-y overflow-auto border px-3 shadow-xl"
              : "border-border mt-3 max-h-72 divide-y overflow-auto border-t"
          }
        >
          {suggestions.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="text-muted-foreground truncate text-xs">{item.subtitle}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => add(item)}
                aria-label={`Add ${item.title} to comparison`}
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );

  return (
    <div className="space-y-5">
      {mode === "drawer" || !displayItems.length ? (
        <div
          className={
            mode === "page"
              ? "border-border flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-center lg:justify-between"
              : "space-y-5"
          }
        >
          <div
            className={
              mode === "page"
                ? "flex shrink-0 items-center justify-between gap-4"
                : "border-border bg-card flex flex-col gap-4 border px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5"
            }
          >
            <div>
              <p className="text-sm font-semibold">
                {mode === "page" ? "Period" : "Reporting period"}
              </p>
              {mode === "drawer" ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  {kind === "actor"
                    ? "The active-user comparison uses this period. Rows marked 7d, 30d, or 90d keep their stated period."
                    : "Active users and new Actors use this period. Runs / 30d always shows 30 days."}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Reporting period">
              {([7, 30, 90] as const).map((days) => (
                <Button
                  key={days}
                  size="sm"
                  variant={days === window ? "default" : "outline"}
                  disabled={refreshing}
                  onClick={() => void changeWindow(days)}
                  aria-pressed={days === window}
                >
                  {days}d
                </Button>
              ))}
            </div>
          </div>

          {mode === "drawer" || !displayItems.length ? searchControl : null}
        </div>
      ) : null}

      {detailError ? (
        <p
          className="border-destructive/30 bg-destructive/5 text-destructive border px-4 py-3 text-xs"
          role="alert"
        >
          {detailError}
        </p>
      ) : null}
      {refreshing ? (
        <p className="text-muted-foreground flex items-center gap-2 text-xs" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating comparison details…
        </p>
      ) : null}
      {displayItems.length && mode === "page" ? (
        <ComparisonWorkspace
          items={displayItems}
          rows={rows}
          kind={kind}
          window={window}
          searchControl={searchControl}
          onRemove={remove}
          onWindowChange={(days) => void changeWindow(days)}
          onSelectorChange={(id) => {
            setReplacementId(id);
            setQuery("");
            setSuggestions([]);
          }}
        />
      ) : displayItems.length ? (
        <ComparisonPanel
          items={displayItems}
          rows={rows}
          onRemove={remove}
          ariaLabel={`${kind === "actor" ? "Actor" : "Builder"} comparison`}
          presentation={mode === "page" ? "columns" : "matrix"}
        />
      ) : (
        <div className="border-border bg-card border px-6 py-10 text-center">
          <p className="font-semibold">
            Choose your first {kind === "actor" ? "Actor" : "builder"}
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Search above, then add up to four more for a side-by-side view.
          </p>
        </div>
      )}
      {displayItems.length ? (
        <>
          <p className="text-muted-foreground text-xs">
            Earnings are public monthly scenarios before costs. Per-Actor minimum, average, and
            maximum use central estimates of covered Actors.
          </p>
          <EarningsMethod />
        </>
      ) : null}
      {mode === "page" && displayItems.length ? (
        <Button size="sm" variant="ghost" onClick={() => router.refresh()}>
          <RotateCcw className="mr-1.5 h-4 w-4" /> Refresh catalog data
        </Button>
      ) : null}
    </div>
  );
}
