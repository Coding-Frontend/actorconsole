"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { X, ArrowRight, Lightbulb, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";

interface SmartInsight {
  id: string;
  type: "opportunity" | "alert" | "tip" | "achievement";
  title: string;
  description: string;
  action?: { label: string; href: string };
}

const ICONS = {
  opportunity: TrendingUp,
  alert: AlertTriangle,
  tip: Lightbulb,
  achievement: CheckCircle2,
};

const COLORS = {
  opportunity: "border-signal-orange/20 bg-signal-orange/10 text-signal-orange",
  alert: "border-signal-orange/20 bg-signal-orange/10 text-signal-orange",
  tip: "border-signal-blue/20 bg-signal-blue/10 text-signal-blue",
  achievement: "border-signal-green/20 bg-signal-green/10 text-signal-green",
};

interface SmartInsightBannerProps {
  insights: SmartInsight[];
  className?: string;
}

/**
 * Rotating smart insight banner — cycles through AI-powered insights
 * for the dashboard. Dismissible, auto-advances.
 */
export function SmartInsightBanner({ insights, className }: SmartInsightBannerProps) {
  const [current, setCurrent] = useState(0);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const intervalRef = useRef<number | undefined>(undefined);

  const visible = insights.filter((i) => !dismissed.includes(i.id));

  useEffect(() => {
    if (visible.length <= 1) return;
    const id = window.setInterval(() => {
      setCurrent((c) => (c + 1) % visible.length);
    }, 8000);
    intervalRef.current = id;
    return () => {
      window.clearInterval(id);
    };
  }, [visible.length]);

  const dismiss = useCallback((id: string) => {
    setDismissed((d) => [...d, id]);
  }, []);

  if (visible.length === 0) return null;

  const insight = visible[current % visible.length];
  const Icon = ICONS[insight.type];
  const color = COLORS[insight.type];

  return (
    <div
      className={cn(
        "border-border/80 bg-card hover:border-border hover:shadow-card group relative rounded-md border px-4 py-3.5 shadow-sm transition-[border-color,box-shadow] duration-200",
        className,
      )}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border",
            color,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-foreground text-sm font-semibold">{insight.title}</p>
            {visible.length > 1 && (
              <span className="text-muted-foreground text-[10px] tabular-nums">
                {current + 1} / {visible.length}
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            {insight.description}
          </p>
          {insight.action && (
            <a
              href={insight.action.href}
              className="text-signal-orange focus-visible:ring-ring mt-2 inline-flex items-center gap-1 text-xs font-semibold underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2"
            >
              {insight.action.label} <ArrowRight className="h-3 w-3" />
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={() => dismiss(insight.id)}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring shrink-0 rounded-sm p-1.5 opacity-70 transition-[background-color,color,opacity] hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
          aria-label={`Dismiss ${insight.title}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
