"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dashboardActorComparisonHref } from "@/components/comparison/comparison-paths";
import { API_BASE_URL } from "@/lib/api-base";
import { KeywordComparison } from "./keyword-comparison";
import { actorKey, type KeywordResult } from "./keyword-research-model";

const storageKey = "actorconsole:keyword-comparison";

interface Snapshot {
  keyword: string;
  results: KeywordResult[];
  available: KeywordResult[];
}

function readSnapshot(): Snapshot | null {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<Snapshot>;
    if (!Array.isArray(parsed.results)) return null;
    return {
      keyword: typeof parsed.keyword === "string" ? parsed.keyword : "",
      results: parsed.results.slice(0, 5),
      available: Array.isArray(parsed.available) ? parsed.available : parsed.results,
    };
  } catch {
    window.sessionStorage.removeItem(storageKey);
    return null;
  }
}

function saveSnapshot(snapshot: Snapshot) {
  window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
}

export function KeywordComparisonPage({
  selection = [],
  keyword = "",
  initialResults = [],
}: {
  selection?: string[];
  keyword?: string;
  initialResults?: KeywordResult[];
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(
    selection.length ? { keyword, results: initialResults, available: initialResults } : null,
  );
  const [loaded, setLoaded] = useState(selection.length > 0);
  const [refreshError, setRefreshError] = useState("");
  const selectionKey = selection.join("|");

  useEffect(() => {
    const stored = readSnapshot();
    if (!selection.length) {
      if (stored?.results.length) {
        router.replace(
          dashboardActorComparisonHref(
            stored.results.map((result) => `${result.username}/${result.name}`),
            stored.keyword,
          ),
        );
      } else {
        setLoaded(true);
      }
      return;
    }

    const requested = new Set(selection.map((id) => id.toLowerCase()));
    const byKey = new Map(initialResults.map((result) => [actorKey(result), result]));
    const matchingStored =
      stored && keyword && stored.keyword.toLowerCase() === keyword.toLowerCase() ? stored : null;
    for (const result of matchingStored?.results ?? []) {
      if (requested.has(actorKey(result))) byKey.set(actorKey(result), result);
    }
    const next: Snapshot = {
      keyword: keyword || matchingStored?.keyword || "",
      results: selection.flatMap((id) => {
        const result = byKey.get(id.toLowerCase());
        return result ? [result] : [];
      }),
      available: matchingStored?.available.length ? matchingStored.available : initialResults,
    };
    setSnapshot(next);
    setLoaded(true);
    // The page is keyed by its path, so this initialization runs once per selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, keyword, router]);

  useEffect(() => {
    if (!selection.length || !keyword.trim()) return;
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/keywords/compare?q=${encodeURIComponent(keyword)}&limit=20`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body?.error?.message ?? "Could not refresh keyword signals");
        return body.data as KeywordResult[];
      })
      .then((available) => {
        const fresh = new Map(available.map((result) => [actorKey(result), result]));
        setSnapshot((current) => {
          if (!current) return current;
          const fallback = new Map(current.results.map((result) => [actorKey(result), result]));
          const next = {
            keyword,
            results: selection.flatMap((id) => {
              const result = fresh.get(id.toLowerCase()) ?? fallback.get(id.toLowerCase());
              return result ? [result] : [];
            }),
            available,
          };
          saveSnapshot(next);
          return next;
        });
        setRefreshError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setRefreshError(
            error instanceof Error ? error.message : "Could not refresh keyword signals",
          );
      });
    return () => controller.abort();
    // The page is keyed by its path, so selection changes remount this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, keyword]);

  function remove(id: string) {
    if (!snapshot) return;
    const removed = snapshot.results.find((result) => result.id === id);
    if (!removed) return;
    const nextSelection = selection.filter((item) => item.toLowerCase() !== actorKey(removed));
    const next = {
      ...snapshot,
      results: snapshot.results.filter((result) => actorKey(result) !== actorKey(removed)),
    };
    saveSnapshot(next);
    setSnapshot(next);
    router.push(dashboardActorComparisonHref(nextSelection, next.keyword));
  }

  function add(result: KeywordResult) {
    if (
      !snapshot ||
      selection.length >= 5 ||
      selection.some((id) => id.toLowerCase() === actorKey(result))
    )
      return;
    const next = { ...snapshot, results: [...snapshot.results, result] };
    saveSnapshot(next);
    setSnapshot(next);
    router.push(
      dashboardActorComparisonHref(
        [...selection, `${result.username}/${result.name}`],
        next.keyword,
      ),
    );
  }

  const results = snapshot?.results ?? [];
  const title =
    results.length === 2
      ? `${results[0].title ?? results[0].name} vs ${results[1].title ?? results[1].name}`
      : "Compare Store Actors";
  const missing = selection.length - results.length;

  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-12">
      <nav
        aria-label="Breadcrumb"
        className="text-muted-foreground flex items-center gap-1.5 text-xs"
      >
        <Link href="/dashboard/keywords" className="hover:text-foreground hover:underline">
          Keyword research
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-foreground">Compare</span>
      </nav>
      <header className="max-w-4xl">
        <p className="text-signal-orange text-xs font-semibold uppercase tracking-[0.18em]">
          Store Actor comparison
        </p>
        <h1 className="font-display-tight mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
          {snapshot?.keyword ? `Selected from “${snapshot.keyword}”. ` : ""}
          Store metrics are observed; opportunity and difficulty are ActorConsole estimates for a
          keyword search.
        </p>
        {!snapshot?.keyword && selection.length ? (
          <p className="text-muted-foreground mt-1 text-xs">
            Open keyword research to add keyword-specific estimates to this comparison.
          </p>
        ) : null}
      </header>
      {refreshError ? (
        <p className="border-border bg-muted/20 border px-4 py-3 text-sm" role="status">
          Keyword estimates could not be refreshed. Showing the available Store data.
        </p>
      ) : null}
      {missing > 0 ? (
        <p className="border-border bg-muted/20 border px-4 py-3 text-sm" role="status">
          {missing} selected Actor{missing === 1 ? "" : "s"} could not be found in the public
          catalog.
        </p>
      ) : null}
      {loaded && snapshot ? (
        <KeywordComparison
          results={results}
          available={snapshot.available}
          onAdd={add}
          onRemove={remove}
          presentation="columns"
        />
      ) : loaded ? (
        <div className="border-border bg-card border px-6 py-12">
          <h2 className="font-display-tight text-xl">No Actors selected</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Choose Actors in keyword research to start a comparison.
          </p>
          <Button asChild className="mt-5">
            <Link href="/dashboard/keywords">Find Actors</Link>
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm" role="status">
          Loading comparison…
        </p>
      )}
    </div>
  );
}
