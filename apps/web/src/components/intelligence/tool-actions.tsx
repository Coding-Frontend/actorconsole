"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { csvCell } from "@actorconsole/shared/actor-intelligence";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics-events";

// Only known export types are sent to Analytics; never include file names or cells.
const exportTypes = {
  "actor-pricing-scenario.csv": "pricing_scenario",
  "actor-seo-audit.csv": "seo_audit",
  "actor-watchlist.csv": "watchlist",
} as const;

export function downloadCsv(name: string, rows: unknown[][]) {
  const blob = new Blob(
    [
      rows
        .map((row) =>
          row
            .map((cell) =>
              typeof cell === "number" && Number.isFinite(cell) ? String(cell) : csvCell(cell),
            )
            .join(","),
        )
        .join("\r\n"),
    ],
    {
      type: "text/csv;charset=utf-8",
    },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  const exportType = Object.hasOwn(exportTypes, name) ? exportTypes[name as keyof typeof exportTypes] : undefined;
  if (exportType) void trackEvent("data_exported", {
    format: "csv", export_type: exportType, row_count: Math.max(0, rows.length - 1),
  });
  // Allow the browser to begin reading the Blob before releasing its URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function CopyText({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success("Copied.");
        } catch {
          toast.error("Copy failed. Select and copy the text manually.");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}
