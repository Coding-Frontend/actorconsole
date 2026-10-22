"use client";

import { useMemo, useState } from "react";
import { ApifyMarkdown } from "@/components/marketing/apify-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, FileText, Sparkles } from "lucide-react";

export interface CopyVariantHistoryRecord {
  id: string;
  field: string;
  value: string;
  generatedBy: string;
  promptContext?: unknown;
  isActive?: boolean;
  createdAt?: string;
}

export interface GroupedCopyVariant {
  id: string;
  generatedBy: string;
  createdAt: string | null;
  isActive: boolean;
  title: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  readme: string | null;
  reasoning: string | null;
}

function copyContext(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function groupKey(record: CopyVariantHistoryRecord) {
  const context = copyContext(record.promptContext);
  if (record.field !== "readme" && context && stringValue(context.title)) {
    return `generated:${stableJson(context)}`;
  }
  if (record.field === "readme") return `readme:${record.id}`;
  if (record.generatedBy === "user" && record.isActive) return "user:active";

  // User-applied fields are created together but older rows predate an
  // explicit generation id. A five-second bucket reconstructs that update
  // without combining unrelated edits made later.
  const createdAt = record.createdAt ? Date.parse(record.createdAt) : Number.NaN;
  const bucket = Number.isFinite(createdAt) ? Math.floor(createdAt / 5_000) : record.id;
  return `${record.generatedBy}:${bucket}`;
}

export function groupCopyVariantHistory(records: CopyVariantHistoryRecord[]): GroupedCopyVariant[] {
  const groups = new Map<string, GroupedCopyVariant>();

  for (const record of records) {
    // Older records may contain category proposals. Categories are now
    // Apify-managed metadata, so those historical mutation rows are hidden
    // from the copy workflow rather than presented as editable variants.
    if (record.field === "categories") continue;
    const context = copyContext(record.promptContext);
    const key = groupKey(record);
    const existing = groups.get(key);
    const createdAt = record.createdAt ?? null;
    const group: GroupedCopyVariant = existing ?? {
      id: record.id,
      generatedBy: record.generatedBy,
      createdAt,
      isActive: false,
      title: stringValue(context?.title),
      description: stringValue(context?.description),
      seoTitle: stringValue(context?.seoTitle),
      seoDescription: stringValue(context?.seoDescription),
      readme: null,
      reasoning: stringValue(context?.reasoning),
    };

    if (record.field === "title") group.title = record.value;
    if (record.field === "description") group.description = record.value;
    if (record.field === "seoTitle") group.seoTitle = record.value;
    if (record.field === "seoDescription") group.seoDescription = record.value;
    if (record.field === "readme") group.readme = record.value;
    group.isActive ||= Boolean(record.isActive);
    if (createdAt && (!group.createdAt || createdAt > group.createdAt)) group.createdAt = createdAt;
    groups.set(key, group);
  }

  return [...groups.values()].sort((left, right) =>
    (right.createdAt ?? "").localeCompare(left.createdAt ?? ""),
  );
}

export function CopyVariantHistory({ variants }: { variants: CopyVariantHistoryRecord[] }) {
  const groups = useMemo(() => groupCopyVariantHistory(variants), [variants]);
  const [preview, setPreview] = useState<GroupedCopyVariant | null>(null);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((variant, index) => (
          <div key={variant.id} className="border-border/60 bg-muted/10 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {variant.readme ? (
                  <FileText className="text-signal-orange h-4 w-4 shrink-0" />
                ) : (
                  <Sparkles className="text-signal-orange h-4 w-4 shrink-0" />
                )}
                <p className="truncate text-sm font-semibold">
                  {variant.readme ? "README draft" : (variant.title ?? `Copy variant ${index + 1}`)}
                </p>
              </div>
              {variant.isActive ? <Badge>Active</Badge> : null}
            </div>
            <p className="text-muted-foreground mt-2 line-clamp-3 text-xs leading-relaxed">
              {variant.readme ?? variant.description ?? variant.seoDescription ?? "Generated copy"}
            </p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-[10px]">
                {variant.generatedBy === "ai" ? "AI generated" : "Applied by user"}
                {variant.createdAt ? ` · ${new Date(variant.createdAt).toLocaleString()}` : ""}
              </span>
              <Button size="sm" variant="outline" onClick={() => setPreview(variant)}>
                <Eye className="h-3.5 w-3.5" /> Preview
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {preview?.readme ? "README preview" : "Generated copy variant"}
            </DialogTitle>
            <DialogDescription>
              Review the complete generated variant as one record, including copy and SEO fields.
            </DialogDescription>
          </DialogHeader>
          {preview?.readme ? (
            <div className="max-h-[65vh] overflow-y-auto rounded-lg border p-5">
              <ApifyMarkdown markdown={preview.readme} />
            </div>
          ) : preview ? (
            <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
              <PreviewField label="Title" value={preview.title} />
              <PreviewField label="Description" value={preview.description} />
              <div className="grid gap-4 sm:grid-cols-2">
                <PreviewField label="SEO title" value={preview.seoTitle} />
                <PreviewField label="SEO description" value={preview.seoDescription} />
              </div>
              {preview.reasoning ? (
                <PreviewField label="Generation rationale" value={preview.reasoning} />
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreviewField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{value ?? "Not included"}</p>
    </div>
  );
}
