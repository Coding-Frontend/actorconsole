import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MetricValue, type ComparisonItem, type ComparisonRow } from "./comparison-ui";

function bestValue(row: ComparisonRow, items: ComparisonItem[]) {
  if (!row.better || items.length < 2) return null;
  const values = items
    .map((item) => item.metrics[row.key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length < 2 || new Set(values).size < 2) return null;
  return row.better === "lower" ? Math.min(...values) : Math.max(...values);
}

export function ComparisonColumns({
  items,
  rows,
  onRemove,
  highlightBest,
  ariaLabel,
  selectionColumn,
}: {
  items: ComparisonItem[];
  rows: ComparisonRow[];
  onRemove?: (id: string) => void;
  highlightBest: boolean;
  ariaLabel: string;
  selectionColumn?: ReactNode;
}) {
  const groups = [...new Set(rows.map((row) => row.group))];
  const columnCount = items.length + (selectionColumn ? 1 : 0);
  const columns = { gridTemplateColumns: `repeat(${columnCount}, minmax(280px, 1fr))` };

  return (
    // Keyboard focus lets people scroll wide comparisons without a pointer.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className="overflow-x-auto" role="region" aria-label={ariaLabel} tabIndex={0}>
      <div style={{ minWidth: Math.max(0, columnCount * 290) }}>
        <div className="grid gap-3" style={columns}>
          {items.map((item) => (
            <div
              key={item.id}
              className="border-border bg-card flex min-h-20 items-start justify-between gap-3 border px-4 py-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <Avatar className="border-border h-9 w-9 shrink-0 border">
                  {item.imageUrl ? <AvatarImage src={item.imageUrl} alt="" /> : null}
                  <AvatarFallback className="text-xs font-semibold">
                    {item.title.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="hover:text-signal-orange inline-flex items-start gap-1 font-semibold leading-5 hover:underline"
                    >
                      <span className="line-clamp-2 break-words">{item.title}</span>
                      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="line-clamp-2 break-words font-semibold leading-5">
                      {item.title}
                    </span>
                  )}
                  <span className="text-muted-foreground mt-1 block break-all text-xs">
                    {item.subtitle}
                  </span>
                </div>
              </div>
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring shrink-0 rounded p-1 focus-visible:outline-none focus-visible:ring-2"
                  aria-label={`Remove ${item.title} from comparison`}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
          {selectionColumn}
        </div>
        {groups.map((group) => (
          <section key={group} aria-label={group} className="mt-7">
            <h2 className="font-display-tight border-border border-b pb-3 text-xl font-semibold">
              {group}
            </h2>
            {rows
              .filter((row) => row.group === group)
              .map((row) => {
                const best = highlightBest ? bestValue(row, items) : null;
                return (
                  <div key={row.key} className="border-border grid gap-3 border-b" style={columns}>
                    {items.map((item) => {
                      const value = item.metrics[row.key];
                      const isBest = best !== null && value === best;
                      return (
                        <div
                          key={item.id}
                          className="flex min-w-0 items-start justify-between gap-4 py-3.5 text-sm"
                        >
                          <span className="text-muted-foreground min-w-0 shrink text-xs sm:text-sm">
                            {row.label}
                          </span>
                          <span
                            className={`min-w-0 max-w-[58%] break-words text-right font-semibold tabular-nums ${isBest ? "text-signal-orange" : "text-foreground"}`}
                            title={isBest ? `Leading value for ${row.label}` : undefined}
                          >
                            <MetricValue value={value} format={row.format} fullText />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
          </section>
        ))}
      </div>
    </div>
  );
}
