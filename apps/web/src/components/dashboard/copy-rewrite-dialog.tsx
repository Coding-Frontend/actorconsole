"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/api-base";
import { trackEvent } from "@/lib/analytics-events";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Sparkles, Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const fields = [
  { key: "title", label: "Title", limit: 100 },
  { key: "description", label: "Description", limit: 500 },
  { key: "seoTitle", label: "SEO title", limit: 60 },
  { key: "seoDescription", label: "SEO description", limit: 160 },
] as const;
type CopyField = (typeof fields)[number]["key"];
type Copy = Record<CopyField, string>;
type CurrentCopy = Record<CopyField, string | null>;
interface Variant extends Copy {
  reasoning: string;
}
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apifyActorId: string;
  onChanged?: () => void;
}

export function CopyRewriteDialog({ open, onOpenChange, apifyActorId, onChanged }: Props) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<Copy | null>(null);
  const [current, setCurrent] = useState<CurrentCopy | null>(null);
  const [selectedFields, setSelectedFields] = useState<CopyField[]>(fields.map(({ key }) => key));
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [review, setReview] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const writing = useRef(false);

  useEffect(() => {
    generation.current += 1;
    request.current?.abort();
    setVariants([]);
    setSelected(null);
    setDraft(null);
    setCurrent(null);
    setLoading(false);
    setUpdating(false);
    setReview(false);
    setApplied(false);
    setKeywords([]);
    setError(null);
    setSelectedFields(fields.map(({ key }) => key));
    return () => {
      generation.current += 1;
      request.current?.abort();
    };
  }, [open, apifyActorId]);

  function changeOpen(next: boolean) {
    if (writing.current) return;
    if (!next) {
      generation.current += 1;
      request.current?.abort();
    }
    onOpenChange(next);
  }

  async function generate() {
    if (writing.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const version = ++generation.current;
    setLoading(true);
    setSelected(null);
    setReview(false);
    setVariants([]);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/actors/${encodeURIComponent(apifyActorId)}/rewrite-copy`,
        {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const body = await response.json().catch(() => null);
      if (controller.signal.aborted || generation.current !== version) return;
      if (!response.ok)
        throw new Error(body?.error?.message ?? "Copy generation could not finish. Please try again.");
      if (!Array.isArray(body?.data?.variants) || !body?.data?.currentCopy)
        throw new Error("Could not load the current listing for review. Generate fresh variants.");
      setVariants(body.data.variants);
      setCurrent(body.data.currentCopy);
      setKeywords(body.data.keywords ?? []);
      void trackEvent("actor_copy_generated", {});
    } catch (err) {
      if (controller.signal.aborted || generation.current !== version) return;
      const message = err instanceof Error ? err.message : "Failed to generate";
      setError(message);
      toast.error(message);
    } finally {
      if (generation.current === version) setLoading(false);
    }
  }

  async function updateActor() {
    if (!draft || !current || !selectedFields.length || writing.current) return;
    const invalid = fields.find(
      ({ key, limit }) =>
        selectedFields.includes(key) && (!draft[key].trim() || draft[key].length > limit),
    );
    if (invalid) {
      setError(`${invalid.label} must contain 1–${invalid.limit} characters.`);
      return;
    }
    writing.current = true;
    setUpdating(true);
    setError(null);
    const version = generation.current;
    try {
      const response = await fetch(
        `${API_BASE_URL}/actors/${encodeURIComponent(apifyActorId)}/copy`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...Object.fromEntries(selectedFields.map((key) => [key, draft[key]])),
            expectedCopy: current,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (generation.current !== version) return;
      if (!response.ok || body?.data?.verified !== true)
        throw new Error(
          body?.error?.message ??
            "Could not verify the listing update. Refresh and review before retrying.",
        );
      setApplied(true);
      void trackEvent("actor_copy_applied", {});
      toast.success("Actor listing updated and verified on Apify");
      onChanged?.();
    } catch (err) {
      if (generation.current === version) {
        const message = err instanceof Error ? err.message : "Actor update failed";
        setError(message);
        toast.error(message);
      }
    } finally {
      writing.current = false;
      if (generation.current === version) setUpdating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:p-0"
        onEscapeKeyDown={(event) => {
          if (writing.current) event.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 border-b p-5 pr-14 sm:p-6 sm:pr-14">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-signal-orange" />
            {applied
              ? "Listing update verified"
              : review
                ? "Review listing changes"
                : "AI rewrite copy"}
          </DialogTitle>
          <DialogDescription>
            {applied
              ? "Apify returned the saved values for every selected field. Your copy history has been updated."
              : "Generate variants, review the current and proposed copy, then apply only the fields you choose."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto p-5 sm:p-6">
          {error ? (
            <Alert tone="danger">{error}</Alert>
          ) : null}
          {applied ? (
            <div className="flex items-start gap-3 py-5">
              <Check className="h-6 w-6 shrink-0 text-signal-green" />
              <p>
                Selected listing fields are saved on Apify. Open the Actor’s History tab to review
                the applied copy.
              </p>
            </div>
          ) : review && draft && current ? (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Only checked fields will change. If someone edits this listing in Apify, you will be
                asked to generate fresh variants.
              </p>
              {fields.map(({ key, label, limit }) => (
                <section key={key} className="min-w-0 rounded-md border p-3 sm:p-4">
                  <label className="mb-3 flex min-h-11 items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(key)}
                      disabled={updating}
                      onChange={(e) =>
                        setSelectedFields((old) =>
                          e.target.checked ? [...old, key] : old.filter((field) => field !== key),
                        )
                      }
                    />
                    {label}
                  </label>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className="mb-2 text-xs text-muted-foreground">Current on Apify</p>
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {current[key] || "Not set"}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <Label htmlFor={`copy-${key}`}>
                        Proposed {label.startsWith("SEO") ? label : label.toLowerCase()}
                      </Label>
                      <Textarea
                        id={`copy-${key}`}
                        value={draft[key]}
                        maxLength={limit}
                        disabled={updating || !selectedFields.includes(key)}
                        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                        className="mt-2"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {draft[key].length}/{limit} characters
                      </p>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          ) : variants.length ? (
            <div className="space-y-3">
              {keywords.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map((word) => (
                    <Badge key={word} variant="outline">
                      {word}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {variants.map((variant, index) => (
                <button
                  type="button"
                  key={index}
                  aria-pressed={selected === index}
                  onClick={() => {
                    setSelected(index);
                    setDraft(variant);
                  }}
                  className={cn(
                    "block w-full min-w-0 rounded-md border p-4 text-left",
                    selected === index && "bg-signal-orange/5 border-signal-orange",
                  )}
                >
                  <p className="text-xs font-semibold text-signal-orange">
                    Variant {index + 1}
                    {selected === index ? " · Selected" : ""}
                  </p>
                  <p className="mt-1 break-words font-semibold">{variant.title}</p>
                  <p className="mt-2 break-words text-sm text-muted-foreground">
                    {variant.description}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{variant.reasoning}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4 py-6 text-center">
              {loading ? (
                <>
                  <Spinner decorative size="xl" className="mx-auto text-signal-orange" />
                  <p role="status">Analyzing actor and generating variants…</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Generate three variants covering different ways to describe this Actor. Nothing
                    changes on Apify until you review and apply.
                  </p>
                  <Button onClick={() => void generate()} variant="gradient">
                    Generate variants
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t bg-card p-4 sm:p-5">
          {applied ? (
            <Button onClick={() => changeOpen(false)}>Done</Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={updating}
                onClick={() => (review ? setReview(false) : changeOpen(false))}
              >
                {review ? "Back to variants" : "Cancel"}
              </Button>
              {variants.length && !review ? (
                <>
                  <Button variant="outline" disabled={loading} onClick={() => void generate()}>
                    Regenerate
                  </Button>
                  <Button
                    disabled={selected === null}
                    onClick={() => setReview(true)}
                    variant="gradient"
                  >
                    Review changes
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
              {review ? (
                <Button
                  onClick={() => void updateActor()}
                  loading={updating}
                  loadingText="Applying and verifying…"
                  disabled={!updating && !selectedFields.length}
                  variant="gradient"
                >
                  Apply selected fields
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
