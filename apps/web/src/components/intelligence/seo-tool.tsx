"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Download,
  FileText,
  Loader2,
  Minus,
  Search,
} from "lucide-react";
import { auditActorSeo } from "@actorconsole/shared/actor-intelligence";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "./tool-actions";
import { cn } from "@/lib/utils";

type SeoResult = ReturnType<typeof auditActorSeo> & {
  name: string;
  sourceUrl: string;
  auditedAt: string;
};
type Filter = "all" | "attention" | "passed" | "unavailable";

export function SeoTool() {
  const params = useSearchParams();
  const [actor, setActor] = useState(params.get("actor") ?? "");
  const [result, setResult] = useState<SeoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function audit(event: React.FormEvent) {
    event.preventDefault();
    if (request.current || !actor.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15_000);
    setLoading(true);
    setError("");
    setResult(null);
    setFilter("all");
    try {
      const response = await fetch(`/api/public/seo?actor=${encodeURIComponent(actor.trim())}`, {
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "The audit could not be completed. Try again.",
        );
      if (!body.data || !Array.isArray(body.data.checks) || typeof body.data.score !== "number") {
        throw new Error("The audit returned an incomplete response. Try again.");
      }
      if (!controller.signal.aborted) setResult(body.data);
    } catch (failure) {
      if (controller.signal.aborted && !timedOut) return;
      setError(
        timedOut
          ? "The Actor took too long to load. Try again."
          : failure instanceof SyntaxError
            ? "The audit returned an unreadable response. Try again."
            : failure instanceof TypeError
              ? "Could not reach the audit service. Check your connection and try again."
              : failure instanceof Error
                ? failure.message
                : "Could not audit this Actor. Try again.",
      );
    } finally {
      clearTimeout(timeout);
      request.current = null;
      if (!controller.signal.aborted || timedOut) setLoading(false);
    }
  }

  const counts = {
    all: result?.checks.length ?? 0,
    attention: result?.checks.filter((check) => check.passed === false).length ?? 0,
    passed: result?.checks.filter((check) => check.passed === true).length ?? 0,
    unavailable: result?.checks.filter((check) => check.passed === null).length ?? 0,
  };
  const checks = result?.checks
    .filter(
      (check) =>
        filter === "all" ||
        (filter === "attention" && check.passed === false) ||
        (filter === "passed" && check.passed === true) ||
        (filter === "unavailable" && check.passed === null),
    )
    .slice()
    .sort(
      (a, b) =>
        (a.passed === false ? 0 : a.passed === null ? 2 : 1) -
        (b.passed === false ? 0 : b.passed === null ? 2 : 1),
    );

  return (
    <div className="space-y-10">
      <section
        aria-labelledby="seo-input-title"
        className="border-border bg-card rounded-lg border p-5 sm:p-8"
      >
        <h2 id="seo-input-title" className="font-display-tight text-2xl">
          Audit a public Actor
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Review search metadata, listing clarity, and documentation before publishing.
        </p>
        <form
          onSubmit={audit}
          className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-end"
        >
          <div className="w-full min-w-0 space-y-2">
            <label htmlFor="seo-actor" className="block text-sm font-medium">
              Public Actor
            </label>
            <Input
              id="seo-actor"
              value={actor}
              onChange={(event) => {
                setActor(event.target.value);
                setError("");
              }}
              placeholder="username/actor-name or Apify URL"
              required
              maxLength={250}
              disabled={loading}
              aria-invalid={Boolean(error)}
              aria-describedby={`seo-actor-hint${error ? " seo-error" : ""}`}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="h-12 text-base shadow-none"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={loading || !actor.trim()}
            className="w-full shrink-0 sm:w-auto"
          >
            {loading ? (
              <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <Search aria-hidden="true" />
            )}
            {loading ? "Auditing…" : "Audit listing"}
          </Button>
        </form>
        <p id="seo-actor-hint" className="text-muted-foreground mt-3 text-xs leading-5">
          Use username/actor-name or https://apify.com/username/actor-name. Audits read public
          information and leave the listing unchanged.
        </p>
        {error && (
          <div
            id="seo-error"
            role="alert"
            className="border-destructive/40 text-destructive mt-5 flex items-start gap-3 rounded-sm border p-4 text-sm leading-6"
          >
            <AlertCircle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{error}</p>
          </div>
        )}
      </section>

      {loading && (
        <div role="status" className="border-border flex items-center gap-4 border-y py-8">
          <Loader2
            className="text-signal-orange h-6 w-6 shrink-0 motion-safe:animate-spin"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium">Reading the public listing</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Checking metadata and available README content. This may take a few seconds.
            </p>
          </div>
        </div>
      )}

      {result && (
        <section aria-labelledby="seo-result-title" className="space-y-8">
          <div className="border-border flex flex-wrap items-center justify-between gap-6 border-b pb-6">
            <div className="min-w-0">
              <h2
                id="seo-result-title"
                className="font-display-tight break-words text-2xl sm:text-3xl"
              >
                {result.name}
              </h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Audited {new Date(result.auditedAt).toLocaleString()}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                downloadCsv("actor-seo-audit.csv", [
                  ["Check", "Passed", "Recommendation", "Listing"],
                  ...result.checks.map((check) => [
                    check.label,
                    check.passed === null ? "Unavailable" : check.passed,
                    check.detail,
                    result.name,
                  ]),
                ])
              }
            >
              <Download aria-hidden="true" /> Export audit
            </Button>
          </div>
          <div className="grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <div className="min-w-0 space-y-8">
              <div className="border-border flex items-center gap-5 border-b pb-6" role="status">
                <p className="font-display-tight text-5xl tabular-nums">
                  {result.score}
                  <span className="text-muted-foreground text-xl">/100</span>
                </p>
                <div>
                  <h3 className="text-sm font-semibold">Editorial score</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {result.assessedChecks} of {result.checks.length} checks assessed
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {counts.attention
                      ? `${counts.attention} ${counts.attention === 1 ? "check needs" : "checks need"} attention`
                      : "All assessed checks passed"}
                  </p>
                </div>
              </div>
              <section aria-labelledby="seo-preview-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 id="seo-preview-title" className="text-lg font-semibold">
                    Search preview
                  </h3>
                  <a
                    href={result.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline underline-offset-4"
                  >
                    View listing <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
                <div className="border-border bg-card mt-4 rounded-lg border p-5 sm:p-6">
                  <p className="text-muted-foreground break-all text-xs leading-5">
                    {result.sourceUrl}
                  </p>
                  <p className="text-signal-blue mt-3 break-words text-xl font-medium">
                    {result.title || "No search title available"}
                  </p>
                  <p className="text-muted-foreground mt-2 break-words text-sm leading-6">
                    {result.description || "No search description available."}
                  </p>
                </div>
                <p className="text-muted-foreground mt-3 text-xs leading-5">
                  Illustrative preview. Search engines may rewrite titles and descriptions.
                </p>
              </section>
              <p className="text-muted-foreground text-sm leading-6">{result.disclaimer}</p>
            </div>
            <section aria-labelledby="seo-checks-title" className="min-w-0">
              <h3 id="seo-checks-title" className="text-lg font-semibold">
                Listing checks
              </h3>
              <div
                role="group"
                aria-label="Filter audit checks"
                className="mt-4 flex flex-wrap gap-2"
              >
                {(
                  [
                    { id: "all", label: "All checks" },
                    { id: "attention", label: "Needs attention" },
                    { id: "passed", label: "Passed" },
                    { id: "unavailable", label: "Unavailable" },
                  ] as const
                ).map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    size="sm"
                    variant={filter === item.id ? "secondary" : "ghost"}
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label} <span className="tabular-nums">{counts[item.id]}</span>
                  </Button>
                ))}
              </div>
              <div aria-live="polite">
                {checks?.length ? (
                  <ul className="divide-border border-border mt-4 divide-y border-y">
                    {checks.map((check) => (
                      <li key={check.label} className="flex gap-3 py-5">
                        <span
                          className={cn(
                            "mt-0.5",
                            check.passed === false
                              ? "text-signal-orange"
                              : check.passed === true
                                ? "text-success"
                                : "text-muted-foreground",
                          )}
                          aria-hidden="true"
                        >
                          {check.passed === null ? (
                            <Minus className="h-5 w-5" />
                          ) : check.passed ? (
                            <Check className="h-5 w-5" />
                          ) : (
                            <AlertCircle className="h-5 w-5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <h4 className="text-sm font-semibold">{check.label}</h4>
                            <span className="text-muted-foreground text-xs">
                              {check.passed === null
                                ? "Unavailable"
                                : check.passed
                                  ? "Passed"
                                  : "Needs attention"}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-2 break-words text-sm leading-6">
                            {check.detail}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="border-border text-muted-foreground mt-4 border-y py-8 text-sm leading-6">
                    No checks in this category. Choose another filter to see the rest of the audit.
                  </p>
                )}
              </div>
            </section>
          </div>
        </section>
      )}

      {!result && !loading && (
        <section
          aria-labelledby="seo-coverage-title"
          className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16"
        >
          <div>
            <h2 id="seo-coverage-title" className="font-display-tight text-2xl">
              Know what to improve.
            </h2>
            <p className="text-muted-foreground mt-3 max-w-[55ch] text-sm leading-6">
              Your audit includes a search preview and an editorial checklist. Start with the checks
              that need attention, then export the recommendations.
            </p>
          </div>
          <ul className="divide-border border-border divide-y border-y">
            {[
              {
                icon: Search,
                title: "Search metadata",
                description:
                  "Review title and description length, with a preview of the available metadata.",
              },
              {
                icon: FileText,
                title: "Listing clarity",
                description:
                  "Check whether the description explains the Actor’s data and use case.",
              },
              {
                icon: Check,
                title: "Documentation",
                description:
                  "Check README length and headings when public documentation is available.",
              },
            ].map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex items-start gap-4 py-5">
                <Icon className="text-muted-foreground mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
