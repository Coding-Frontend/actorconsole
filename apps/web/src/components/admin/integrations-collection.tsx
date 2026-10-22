"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { IntegrationCategory } from "@actorconsole/shared";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CollectionViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";

export type IntegrationItem = {
  key: string;
  label: string;
  description: string;
  category: IntegrationCategory;
  isConfigured: boolean;
  testStatus: string | null;
  testMessage: string | null;
  updatedAt: string | null;
  isActive?: boolean;
  activeConsoleCredential?: "apify_ui_token" | "apify_cookies" | null;
};

function uiTokenProvidedByCookies(item: IntegrationItem): boolean {
  return item.key === "apify_ui_token" && item.activeConsoleCredential === "apify_cookies";
}

const categoryColors: Record<string, string> = {
  payment: "bg-signal-blue/10 text-signal-blue",
  ai: "bg-signal-blue/10 text-signal-blue",
  scraping: "bg-signal-green/10 text-signal-green",
  email: "bg-signal-orange/10 text-signal-orange",
  apify: "bg-signal-green/10 text-signal-green",
  storage: "bg-signal-blue/10 text-signal-blue",
  observability: "bg-signal-orange/10 text-signal-orange",
};

export function IntegrationsCollection({
  byCategory,
}: {
  byCategory: Record<string, IntegrationItem[]>;
}) {
  const [view, setView] = useState<CollectionViewMode>(() =>
    typeof window !== "undefined" &&
    window.localStorage.getItem("actorconsole:integrations-view") === "list"
      ? "list"
      : "grid",
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("label");

  const categories = useMemo(() => Object.keys(byCategory).sort(), [byCategory]);
  const filteredByCategory = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return Object.fromEntries(
      Object.entries(byCategory)
        .filter(([group]) => category === "all" || group === category)
        .map(([group, items]) => {
          const filtered = items
            .filter((item) => {
              const matchesQuery =
                !normalizedQuery ||
                [item.key, item.label, item.description].some((value) =>
                  value.toLowerCase().includes(normalizedQuery),
                );
              const matchesStatus =
                status === "all" ||
                (status === "configured" &&
                  (item.isConfigured || uiTokenProvidedByCookies(item))) ||
                (status === "unconfigured" &&
                  !item.isConfigured &&
                  !uiTokenProvidedByCookies(item)) ||
                (status === "verified" && item.testStatus === "ok") ||
                (status === "failed" &&
                  item.testStatus === "error" &&
                  !uiTokenProvidedByCookies(item));
              return matchesQuery && matchesStatus;
            })
            .sort((a, b) => {
              if (sort === "updatedAt") {
                return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
              }
              if (sort === "status") {
                return (
                  Number(b.isConfigured) - Number(a.isConfigured) || a.label.localeCompare(b.label)
                );
              }
              return a.label.localeCompare(b.label);
            });
          return [group, filtered];
        })
        .filter(([, items]) => items.length > 0),
    ) as Record<string, IntegrationItem[]>;
  }, [byCategory, category, query, sort, status]);

  function changeView(nextView: CollectionViewMode) {
    setView(nextView);
    window.localStorage.setItem("actorconsole:integrations-view", nextView);
  }

  return (
    <div className="space-y-6">
      <div className="border-border grid gap-3 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_180px_180px_auto]">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search integrations"
          aria-label="Search integrations"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Integration category"
          className="border-input bg-card h-10 rounded-md border px-3 text-sm"
        >
          <option value="all">All categories</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Integration status"
          className="border-input bg-card h-10 rounded-md border px-3 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="configured">Configured</option>
          <option value="unconfigured">Not configured</option>
          <option value="verified">Verified</option>
          <option value="failed">Test failed</option>
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort integrations"
          className="border-input bg-card h-10 rounded-md border px-3 text-sm"
        >
          <option value="label">Name</option>
          <option value="updatedAt">Recently updated</option>
          <option value="status">Configuration status</option>
        </select>
        <ViewModeToggle value={view} onValueChange={changeView} label="Integrations view" />
      </div>
      {Object.entries(filteredByCategory).map(([category, items]) => (
        <section key={category}>
          <h3 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wider">
            {category}
          </h3>
          <div
            className={
              view === "grid"
                ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                : "border-border bg-card divide-border divide-y rounded-md border"
            }
          >
            {items.map((integration) => (
              <IntegrationCard key={integration.key} item={integration} view={view} />
            ))}
          </div>
        </section>
      ))}
      {Object.keys(filteredByCategory).length === 0 ? (
        <div className="border-border text-muted-foreground rounded-md border border-dashed p-10 text-center text-sm">
          No integrations match the active search and filters.
        </div>
      ) : null}
    </div>
  );
}

function IntegrationCard({ item, view }: { item: IntegrationItem; view: CollectionViewMode }) {
  const providedByCookies = uiTokenProvidedByCookies(item);
  return (
    <Link href={`/admin/integrations/${item.key}`}>
      <Card
        className={
          view === "grid"
            ? "hover:border-signal-orange/40 hover:shadow-card-hover h-full transition-all hover:-translate-y-0.5"
            : "hover:bg-muted/20 rounded-none border-0 shadow-none transition-colors"
        }
      >
        <div className={view === "grid" ? "p-4" : "flex items-start justify-between gap-5 p-4"}>
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.label}</p>
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                  {item.description}
                </p>
              </div>
              <Badge
                variant="outline"
                className={`shrink-0 text-[10px] ${categoryColors[item.category] ?? ""}`}
              >
                {item.category}
              </Badge>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {item.isConfigured || providedByCookies ? (
                <CheckCircle2 className="text-signal-green h-3.5 w-3.5" />
              ) : (
                <XCircle className="text-muted-foreground/40 h-3.5 w-3.5" />
              )}
              <span className="text-muted-foreground text-xs">
                {providedByCookies
                  ? "Provided by cookies"
                  : item.isConfigured
                    ? "Configured"
                    : "Not configured"}
              </span>
              {item.testStatus === "error" && !providedByCookies ? (
                <Badge variant="destructive" className="text-[10px]">
                  Test failed
                </Badge>
              ) : null}
              {item.testStatus === "ok" && !providedByCookies ? (
                <Badge variant="success" className="text-[10px]">
                  Verified
                </Badge>
              ) : null}
              {item.isActive ? (
                <Badge
                  variant="outline"
                  className="border-signal-blue/35 text-signal-blue text-[10px]"
                >
                  Active
                </Badge>
              ) : null}
            </div>
            {item.updatedAt ? (
              <p className="text-muted-foreground mt-1 text-[10px]">
                Updated {formatDate(item.updatedAt)}
              </p>
            ) : null}
            {providedByCookies ? (
              <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                No manual UI key is needed while Platform Apify Cookies are active.
              </p>
            ) : null}
            {item.testStatus === "error" && item.testMessage && !providedByCookies ? (
              <p className="text-destructive mt-2 line-clamp-2 text-[11px] leading-relaxed">
                {item.testMessage}
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    </Link>
  );
}
