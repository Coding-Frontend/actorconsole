"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollectionViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BuilderMetric =
  | "new-actors"
  | "actors"
  | "monthly-users"
  | "total-users"
  | "monthly-runs"
  | "total-runs"
  | "estimated-revenue";
type BuilderWindow = 7 | 30 | 90;

const BUILDER_METRICS: Array<{
  value: BuilderMetric;
  label: string;
  group: "Publishing" | "Users" | "Runs" | "Earnings";
}> = [
  { value: "new-actors", label: "New Actors", group: "Publishing" },
  { value: "actors", label: "Total Actors", group: "Publishing" },
  { value: "monthly-users", label: "Active users", group: "Users" },
  { value: "total-users", label: "Total users", group: "Users" },
  { value: "monthly-runs", label: "30-day runs", group: "Runs" },
  { value: "total-runs", label: "Total runs", group: "Runs" },
  { value: "estimated-revenue", label: "Estimated revenue / 30d", group: "Earnings" },
];

const BUILDER_WINDOWS: BuilderWindow[] = [7, 30, 90];

const metricGroups = ["Publishing", "Users", "Runs", "Earnings"] as const;

export function LeaderboardControls({
  metric,
  window,
  query,
  view,
  tableOnly = false,
}: {
  metric: BuilderMetric;
  window: BuilderWindow;
  query: string;
  view: CollectionViewMode;
  tableOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(query);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setSearchValue(query), [query]);

  function updateRoute(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateRoute({ q: searchValue.trim() || null });
  }

  return (
    <div
      className={
        tableOnly
          ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,.8fr)_10rem_minmax(16rem,1fr)] lg:items-end"
          : "grid gap-4 lg:grid-cols-[minmax(12rem,0.8fr)_10rem_minmax(16rem,1fr)_auto] lg:items-end"
      }
      aria-busy={isPending}
    >
      <div className="grid gap-2">
        <span className="type-kicker">Leaderboard</span>
        <Select
          value={metric}
          onValueChange={(value) => updateRoute({ metric: value, direction: null })}
          disabled={isPending}
        >
          <SelectTrigger aria-label="Leaderboard metric">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {metricGroups.map((group, groupIndex) => (
              <SelectGroup key={group}>
                {groupIndex > 0 ? <SelectSeparator /> : null}
                <SelectLabel>{group}</SelectLabel>
                {BUILDER_METRICS.filter((item) => item.group === group).map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <span className="type-kicker">Window</span>
        <Select
          value={String(window)}
          onValueChange={(value) => updateRoute({ window: value })}
          disabled={isPending}
        >
          <SelectTrigger aria-label="Leaderboard window">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUILDER_WINDOWS.map((days) => (
              <SelectItem key={days} value={String(days)}>
                {days} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <form onSubmit={submitSearch} className="grid gap-2">
        <span className="type-kicker flex items-center justify-between gap-3">
          <span>Search</span>
          {isPending ? (
            <span className="text-signal-blue inline-flex items-center gap-1.5 normal-case tracking-normal">
              <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" /> Updating
            </span>
          ) : null}
        </span>
        <div className="flex gap-2">
          <span className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              id="builder-search"
              name="q"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Builder username or Actor"
              className="h-12 pl-11"
              aria-label="Search builders or Actors"
            />
          </span>
          <Button type="submit" size="lg" className="h-12 shrink-0" disabled={isPending}>
            Search
          </Button>
        </div>
      </form>
      {!tableOnly && (
        <div className="grid gap-2">
          <span className="type-kicker">Layout</span>
          <ViewModeToggle
            value={view}
            onValueChange={(nextView) => updateRoute({ view: nextView })}
            label="Leaderboard view"
          />
        </div>
      )}
    </div>
  );
}
