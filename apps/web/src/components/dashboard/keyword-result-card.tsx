"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KeywordResult } from "./keyword-research-model";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function KeywordTrend({ value }: { value?: number | null }) {
  if (value == null) return <span className="text-muted-foreground">No history</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium tabular-nums",
        value > 0 ? "text-signal-green" : value < 0 ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {value > 0 ? (
        <ArrowUpRight className="h-3.5 w-3.5" />
      ) : value < 0 ? (
        <ArrowDownRight className="h-3.5 w-3.5" />
      ) : null}
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  );
}

export function KeywordResultCard({
  result,
  trackedId,
  selected,
  onSelect,
}: {
  result: KeywordResult;
  trackedId?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const score = result.opportunityScore ?? 0;
  return (
    <article
      className={cn(
        "border-border/80 bg-card hover:border-foreground/30 flex h-full min-w-0 flex-col border p-4 transition-colors",
        selected && "border-signal-orange/70 bg-signal-orange/[0.04]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-foreground truncate text-sm font-semibold"
            title={result.title ?? result.name}
          >
            {result.title ?? result.name}
          </p>
          <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
            @{result.username}/{result.name}
          </p>
        </div>
        <label className="text-muted-foreground hover:text-foreground inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={`Compare ${result.title ?? result.name}`}
            className="accent-signal-orange h-4 w-4"
          />
          Compare
        </label>
      </div>
      <p className="text-muted-foreground mt-3 line-clamp-2 min-h-10 text-xs leading-5">
        {result.description ?? "No description available."}
      </p>
      <div className="border-border/60 mt-4 grid grid-cols-3 gap-2 border-t pt-3">
        <div>
          <p className="text-muted-foreground text-[10px]">30-day users</p>
          <p className="text-foreground mt-1 text-sm font-semibold tabular-nums">
            {result.monthlyUsers == null ? "—" : compact.format(result.monthlyUsers)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-[10px]">Total runs</p>
          <p className="text-foreground mt-1 text-sm font-semibold tabular-nums">
            {result.totalRuns == null ? "—" : compact.format(result.totalRuns)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-[10px]">History</p>
          <p className="mt-1 text-xs">
            <KeywordTrend value={result.demandTrendPercent} />
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex justify-between text-[11px]">
            <span className="text-muted-foreground">Opportunity</span>
            <span className="text-foreground font-semibold tabular-nums">{score}/100</span>
          </div>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className={cn("h-full", score >= 70 ? "bg-signal-green" : "bg-signal-orange")}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
        <span className="border-border/70 text-muted-foreground shrink-0 border px-1.5 py-1 font-mono text-[10px]">
          KD {result.difficultyScore ?? "—"}
        </span>
      </div>
      <div className="border-border/60 mt-4 flex items-center justify-between gap-2 border-t pt-3 text-xs">
        {trackedId ? (
          <Link
            href={`/dashboard/actors/${trackedId}`}
            className="text-signal-green hover:underline"
          >
            <Check className="mr-1 inline h-3.5 w-3.5" /> In workspace
          </Link>
        ) : (
          <span className="text-muted-foreground">Store listing</span>
        )}
        <a
          href={`https://apify.com/${encodeURIComponent(result.username)}/${encodeURIComponent(result.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground inline-flex items-center gap-1 font-medium hover:underline"
        >
          View Actor <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </article>
  );
}
