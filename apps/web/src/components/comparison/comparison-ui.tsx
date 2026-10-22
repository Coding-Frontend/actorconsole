import { earningsMoney } from "@/components/intelligence/earnings-summary";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface ComparisonItem {
  id: string;
  title: string;
  subtitle: string;
  href?: string;
  imageUrl?: string | null;
  metrics: Record<string, number | string | string[] | null>;
}

export interface ComparisonRow {
  key: string;
  label: string;
  group: string;
  format?: "currency" | "number" | "rating" | "score" | "percent" | "text" | "tags";
  better?: "higher" | "lower";
}

export function comparisonValuePresent(value: ComparisonItem["metrics"][string] | undefined) {
  return value != null && value !== "" && (!Array.isArray(value) || value.length > 0);
}

export function MetricValue({
  value,
  format,
  fullText = false,
}: {
  value: ComparisonItem["metrics"][string] | undefined;
  format: ComparisonRow["format"];
  fullText?: boolean;
}) {
  if (!comparisonValuePresent(value))
    return <span className="text-muted-foreground font-normal">—</span>;
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1" title={value.join(", ")}>
        {value.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="border-border bg-muted/40 border px-1.5 py-0.5 text-[11px] font-medium"
          >
            {tag}
          </span>
        ))}
        {value.length > 4 ? (
          <span className="text-muted-foreground text-[11px]">+{value.length - 4}</span>
        ) : null}
      </span>
    );
  }
  if (typeof value === "string") {
    return (
      <span
        className={
          format === "text"
            ? `${fullText ? "" : "line-clamp-3"} font-normal leading-5`
            : "font-medium leading-5"
        }
        title={value}
      >
        {value}
      </span>
    );
  }
  if (typeof value === "number") {
    if (format === "currency") return <>{earningsMoney(value)}</>;
    if (format === "rating") return <>{value.toFixed(1)} / 5</>;
    if (format === "score") return <>{value} / 100</>;
    if (format === "percent")
      return (
        <>
          {value > 0 ? "+" : ""}
          {value}%
        </>
      );
    return <>{new Intl.NumberFormat("en-US").format(value)}</>;
  }
  return null;
}

export function ComparisonMatrix({
  items,
  rows,
  onRemove,
  removeHref,
  ariaLabel = "Side by side comparison",
}: {
  items: ComparisonItem[];
  rows: ComparisonRow[];
  onRemove?: (id: string) => void;
  removeHref?: (id: string) => string;
  ariaLabel?: string;
}) {
  return (
    <div className="border-border overflow-x-auto border" role="region" aria-label={ariaLabel}>
      <table
        className="w-full table-fixed border-collapse text-sm"
        style={{ minWidth: 176 + items.length * 216 }}
      >
        <thead>
          <tr className="bg-muted/45">
            <th className="border-border bg-muted/45 text-muted-foreground sticky left-0 z-10 w-36 min-w-36 border-b border-r px-4 py-5 text-left text-xs font-medium sm:w-44 sm:min-w-44">
              Metric
            </th>
            {items.map((item) => (
              <th
                key={item.id}
                className="border-border min-w-44 max-w-56 border-b border-r px-4 py-4 text-left align-top last:border-r-0 sm:min-w-52"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    {item.imageUrl ? (
                      <Avatar className="border-border h-8 w-8 shrink-0 border">
                        <AvatarImage src={item.imageUrl} alt="" />
                        <AvatarFallback className="text-[10px]">
                          {item.title.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ) : null}
                    <div className="min-w-0">
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="text-foreground hover:text-signal-blue inline-flex items-start gap-1 font-semibold leading-5 hover:underline"
                        >
                          <span className="line-clamp-2 break-words">{item.title}</span>
                          <ArrowUpRight
                            className="mt-0.5 h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                          />
                        </Link>
                      ) : (
                        <span className="text-foreground line-clamp-2 break-words font-semibold leading-5">
                          {item.title}
                        </span>
                      )}
                      <span className="text-muted-foreground mt-1 block break-all text-xs font-normal">
                        {item.subtitle}
                      </span>
                    </div>
                  </div>
                  {onRemove ? (
                    <button
                      type="button"
                      onClick={() => onRemove(item.id)}
                      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded p-1 focus-visible:outline-none focus-visible:ring-2"
                      aria-label={`Remove ${item.title} from comparison`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : removeHref ? (
                    <Link
                      href={removeHref(item.id)}
                      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded p-1 focus-visible:outline-none focus-visible:ring-2"
                      aria-label={`Remove ${item.title} from comparison`}
                    >
                      <X className="h-4 w-4" />
                    </Link>
                  ) : null}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key} className={index % 2 ? "bg-muted/20" : "bg-card"}>
              <th className="border-border text-muted-foreground sticky left-0 z-10 border-b border-r bg-inherit px-4 py-3 text-left text-xs font-medium">
                {row.label}
              </th>
              {items.map((item) => (
                <td
                  key={item.id}
                  className="border-border text-foreground border-b border-r px-4 py-3 font-semibold tabular-nums last:border-r-0"
                >
                  <MetricValue value={item.metrics[row.key]} format={row.format} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
