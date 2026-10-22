import { Card, CardContent } from "@/components/ui/card";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  delta?: number;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "success";
}

export function StatCard({ label, value, delta, hint, icon: Icon, tone = "default" }: Props) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="hover:border-signal-blue/35 group relative overflow-hidden shadow-sm">
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-0.5",
          tone === "warning" && "bg-signal-orange",
          tone === "success" && "bg-signal-green",
          tone === "default" && "bg-signal-blue",
        )}
      />
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="data-stamp text-muted-foreground uppercase tracking-[0.08em]">{label}</p>
          <Icon
            className={cn(
              "h-4 w-4",
              tone === "warning" && "text-signal-orange",
              tone === "success" && "text-signal-green",
              tone === "default" && "text-signal-blue",
            )}
            strokeWidth={1.9}
          />
        </div>
        <div>
          <p className="font-display-tight text-[26px] tabular-nums">{value}</p>
          {hint ? <p className="text-muted-foreground mt-1 text-[11px]">{hint}</p> : null}
          {delta !== undefined ? (
            <p
              className={cn(
                "mt-1 flex items-center gap-1 font-mono text-[10px] font-medium",
                positive
                  ? "text-signal-green"
                  : "text-destructive",
              )}
            >
              {positive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {positive ? "+" : ""}
              {delta}%
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
