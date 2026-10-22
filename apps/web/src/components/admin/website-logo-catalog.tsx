"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ImageOff, RefreshCw, RotateCcw, Upload } from "lucide-react";
import { api } from "@/lib/admin/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Logo = {
  id: string;
  assetUrl: string;
  sourceUrl: string | null;
  sourceKind: string;
  reviewStatus: string;
  createdAt: string;
};

export type WebsiteLogoCatalogData = {
  items: Array<{
    id: string;
    name: string;
    slug: string;
    canonicalDomain: string | null;
    aliases: unknown;
    status: string;
    logoError: string | null;
    updatedAt: string;
    currentLogo: Logo | null;
    logos: Logo[];
    _count: { storeActors: number; actors: number; logos: number };
  }>;
  total: number;
  page: number;
  limit: number;
  counts: {
    classified: number;
    unclassified: number;
    missingLogo: number;
    pendingReview: number;
    failed: number;
  };
  runs: Array<{
    id: string;
    operation: string;
    status: string;
    expectedCount: number | null;
    processedCount: number;
    matchedCount: number;
    unresolvedCount: number;
    failedCount: number;
    retryCount: number;
    error: string | null;
  }>;
};

export function WebsiteLogoCatalog({ initialData }: { initialData: WebsiteLogoCatalogData }) {
  const [data, setData] = useState(initialData);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [logoStatus, setLogoStatus] = useState("all");
  const [identityStatus, setIdentityStatus] = useState("all");
  const [confidence, setConfidence] = useState("all");
  const [actorCount, setActorCount] = useState("all");
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);

  const loadPage = useCallback(
    async function loadPage(
      page = data.page,
      overrides: Partial<{
        query: string;
        logoStatus: string;
        identityStatus: string;
        confidence: string;
        actorCount: string;
      }> = {},
    ) {
      const next = {
        query: overrides.query ?? query,
        logoStatus: overrides.logoStatus ?? logoStatus,
        identityStatus: overrides.identityStatus ?? identityStatus,
        confidence: overrides.confidence ?? confidence,
        actorCount: overrides.actorCount ?? actorCount,
      };
      const response = await api<WebsiteLogoCatalogData>("/admin/website-logos", {
        params: {
          page,
          limit: data.limit,
          q: next.query || undefined,
          logoStatus: next.logoStatus === "all" ? undefined : next.logoStatus,
          status: next.identityStatus === "all" ? undefined : next.identityStatus,
          confidence: next.confidence === "all" ? undefined : next.confidence,
          actorCount: next.actorCount === "all" ? undefined : next.actorCount,
        },
      });
      if (response.ok) setData(response.data);
      else toast.error(response.error.message);
    },
    [actorCount, confidence, data.limit, data.page, identityStatus, logoStatus, query],
  );

  const reload = useCallback(async () => {
    await loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!data.runs.some((run) => run.status === "RUNNING")) return;
    const timer = window.setInterval(() => void reload(), 5_000);
    return () => window.clearInterval(timer);
  }, [data.runs, reload]);

  async function startRun(catalog: "classification" | "logos") {
    setWorking(catalog);
    const response = await api(`/admin/website-logos/runs/${catalog}`, { method: "POST" });
    if (response.ok) {
      toast.success(
        `${catalog === "classification" ? "Classification" : "Logo enrichment"} queued`,
      );
      window.setTimeout(() => void reload(), 1_000);
    } else toast.error(response.error.message);
    setWorking(null);
  }

  async function importLogo(event: FormEvent<HTMLFormElement>, websiteId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const sourceUrl = String(form.get("sourceUrl") ?? "").trim();
    if (!sourceUrl) return;
    setWorking(websiteId);
    const response = await api<Logo>(`/admin/website-logos/${websiteId}/import`, {
      method: "POST",
      body: JSON.stringify({ sourceUrl, activate: false }),
    });
    if (response.ok) {
      toast.success("Official-source logo imported for review");
      event.currentTarget.reset();
      await reload();
    } else toast.error(response.error.message);
    setWorking(null);
  }

  async function uploadLogo(file: File | undefined, websiteId: string) {
    if (!file) return;
    setWorking(websiteId);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(`/api/admin/website-logos/${websiteId}/upload`, {
      method: "POST",
      body: form,
    });
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (response.ok) {
      toast.success("Logo uploaded for review");
      await reload();
    } else toast.error(body?.error?.message ?? "Logo upload failed");
    setWorking(null);
  }

  async function activate(websiteId: string, logoId: string) {
    setWorking(logoId);
    const response = await api<{ affectedActors: number }>(
      `/admin/website-logos/${websiteId}/logos/${logoId}/activate`,
      { method: "POST" },
    );
    if (response.ok) {
      toast.success(
        `Logo activated; ${response.data.affectedActors} workspace Actor recommendations created`,
      );
      await reload();
    } else toast.error(response.error.message);
    setWorking(null);
  }

  async function mergeWebsite(sourceWebsiteId: string) {
    const targetWebsiteId = mergeTargets[sourceWebsiteId];
    if (!targetWebsiteId) return;
    setWorking(`merge:${sourceWebsiteId}`);
    const response = await api(`/admin/website-logos/${targetWebsiteId}/merge`, {
      method: "POST",
      body: JSON.stringify({ sourceWebsiteId }),
    });
    if (response.ok) {
      toast.success("Duplicate website merged and Actor assignments preserved");
      await reload();
    } else toast.error(response.error.message);
    setWorking(null);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(
          [
            ["Classified Actors", data.counts.classified],
            ["Unclassified", data.counts.unclassified],
            ["Missing logo", data.counts.missingLogo],
            ["Pending review", data.counts.pendingReview],
            ["Failed", data.counts.failed],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="border-border bg-card rounded-md border p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wider">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value.toLocaleString("en-IN")}</p>
          </div>
        ))}
      </div>

      <form
        className="border-border bg-card grid gap-3 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_180px_180px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          const nextQuery = queryInput.trim();
          setQuery(nextQuery);
          void loadPage(1, { query: nextQuery });
        }}
      >
        <div className="flex gap-2">
          <Input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Search website, service, or domain"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </div>
        <select
          value={logoStatus}
          onChange={(event) => {
            const value = event.target.value;
            setLogoStatus(value);
            void loadPage(1, { logoStatus: value });
          }}
          className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          aria-label="Logo status"
        >
          <option value="all">All logo statuses</option>
          <option value="ready">Active logo</option>
          <option value="missing">Missing logo</option>
        </select>
        <select
          value={identityStatus}
          onChange={(event) => {
            const value = event.target.value;
            setIdentityStatus(value);
            void loadPage(1, { identityStatus: value });
          }}
          className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          aria-label="Website status"
        >
          <option value="all">All website statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="LOGO_FAILED">Logo failed</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <select
          value={confidence}
          onChange={(event) => {
            const value = event.target.value;
            setConfidence(value);
            void loadPage(1, { confidence: value });
          }}
          className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          aria-label="Classification confidence"
        >
          <option value="all">All confidence levels</option>
          <option value="high">High confidence</option>
          <option value="medium">Medium confidence</option>
          <option value="low">Low confidence</option>
        </select>
        <select
          value={actorCount}
          onChange={(event) => {
            const value = event.target.value;
            setActorCount(value);
            void loadPage(1, { actorCount: value });
          }}
          className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          aria-label="Actor count"
        >
          <option value="all">Any Actor count</option>
          <option value="with">Has classified Actors</option>
          <option value="without">No classified Actors</option>
        </select>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-5 xl:justify-end">
          <Button
            variant="outline"
            disabled={Boolean(working)}
            onClick={() => void startRun("classification")}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Reclassify
          </Button>
          <Button
            variant="signal"
            disabled={Boolean(working)}
            onClick={() => void startRun("logos")}
          >
            <Upload className="mr-2 h-4 w-4" />
            Find official logos
          </Button>
        </div>
      </form>

      <div className="space-y-3">
        {data.items.map((website) => (
          <article key={website.id} className="border-border bg-card rounded-md border p-4">
            <div className="grid gap-5 xl:grid-cols-[96px_minmax(200px,1fr)_minmax(320px,1.5fr)]">
              <div className="bg-muted grid h-24 w-24 place-items-center overflow-hidden rounded-xl">
                {website.currentLogo ? (
                  <Image
                    src={website.currentLogo.assetUrl}
                    alt={`${website.name} logo`}
                    width={96}
                    height={96}
                    unoptimized
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <ImageOff className="text-muted-foreground h-8 w-8" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{website.name}</h2>
                  <Badge variant={website.currentLogo ? "success" : "outline"}>
                    {website.currentLogo ? "Active logo" : "Missing logo"}
                  </Badge>
                  {website.status !== "ACTIVE" ? (
                    <Badge variant="warning">{website.status}</Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground mt-1 font-mono text-xs">
                  {website.canonicalDomain ?? website.slug}
                </p>
                <p className="text-muted-foreground mt-3 text-sm">
                  {website._count.storeActors.toLocaleString("en-IN")} public Actors ·{" "}
                  {website._count.actors.toLocaleString("en-IN")} workspace Actors
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Updated {new Date(website.updatedAt).toLocaleString()}
                </p>
                {Array.isArray(website.aliases) && website.aliases.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {website.aliases.slice(0, 8).map((alias) =>
                      typeof alias === "string" ? (
                        <Badge key={alias} variant="outline">
                          {alias}
                        </Badge>
                      ) : null,
                    )}
                  </div>
                ) : null}
                {website.currentLogo?.sourceUrl ? (
                  <a
                    href={website.currentLogo.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-signal-blue mt-2 block truncate text-xs underline"
                  >
                    {website.currentLogo.sourceKind}: {website.currentLogo.sourceUrl}
                  </a>
                ) : null}
                {website.logoError ? (
                  <p className="text-destructive mt-2 text-xs" role="alert">
                    {website.logoError}
                  </p>
                ) : null}
              </div>
              <div className="space-y-3">
                <form
                  onSubmit={(event) => void importLogo(event, website.id)}
                  className="flex gap-2"
                >
                  <Input
                    name="sourceUrl"
                    type="url"
                    required
                    placeholder="Official press-kit or website image URL"
                  />
                  <Button type="submit" variant="outline" disabled={working === website.id}>
                    Import
                  </Button>
                </form>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="border-input hover:bg-accent inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload reviewed file
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
                      className="sr-only"
                      onChange={(event) => void uploadLogo(event.target.files?.[0], website.id)}
                    />
                  </label>
                  {website.logos.map((logo) => (
                    <Button
                      key={logo.id}
                      size="sm"
                      variant={website.currentLogo?.id === logo.id ? "signal" : "outline"}
                      disabled={working === logo.id || website.currentLogo?.id === logo.id}
                      onClick={() => void activate(website.id, logo.id)}
                    >
                      {website.currentLogo?.id === logo.id ? (
                        "Active"
                      ) : (
                        <>
                          <RotateCcw className="mr-1 h-3.5 w-3.5" />
                          Activate {logo.sourceKind.toLowerCase().replaceAll("_", " ")}
                        </>
                      )}
                    </Button>
                  ))}
                </div>
                <div className="border-border/60 flex flex-col gap-2 border-t pt-3 sm:flex-row">
                  <select
                    value={mergeTargets[website.id] ?? ""}
                    onChange={(event) =>
                      setMergeTargets((current) => ({
                        ...current,
                        [website.id]: event.target.value,
                      }))
                    }
                    aria-label={`Merge ${website.name} into another website`}
                    className="border-input bg-background h-9 min-w-0 flex-1 rounded-md border px-3 text-sm"
                  >
                    <option value="">Merge duplicate into…</option>
                    {data.items
                      .filter((candidate) => candidate.id !== website.id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!mergeTargets[website.id] || working === `merge:${website.id}`}
                    onClick={() => void mergeWebsite(website.id)}
                  >
                    Merge
                  </Button>
                  {website.status === "LOGO_FAILED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={Boolean(working)}
                      onClick={() => void startRun("logos")}
                    >
                      Retry official source
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Website pages">
        <span className="text-muted-foreground">
          Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))} ·{" "}
          {data.total.toLocaleString("en-IN")} websites
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1 || Boolean(working)}
            onClick={() => void loadPage(data.page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= Math.ceil(data.total / data.limit) || Boolean(working)}
            onClick={() => void loadPage(data.page + 1)}
          >
            Next
          </Button>
        </div>
      </nav>

      {data.runs.length ? (
        <section className="border-border bg-card rounded-md border p-4">
          <h2 className="font-semibold">Background runs</h2>
          <div className="mt-3 divide-y">
            {data.runs.map((run) => (
              <div key={run.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_110px_2fr]">
                <span>{run.operation.replaceAll("_", " ").toLowerCase()}</span>
                <Badge
                  variant={
                    run.status === "COMPLETED"
                      ? "success"
                      : run.status === "FAILED"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {run.status}
                </Badge>
                <span className="text-muted-foreground">
                  {run.processedCount}/{run.expectedCount ?? "?"} processed · {run.matchedCount}{" "}
                  matched · {run.unresolvedCount} unresolved · {run.failedCount} failed ·{" "}
                  {run.retryCount} retries
                </span>
                {run.error ? (
                  <span className="text-destructive sm:col-start-3">{run.error}</span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
