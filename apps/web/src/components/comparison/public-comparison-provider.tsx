"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { GitCompareArrows, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  publicComparisonHref,
  type PublicCompareItem,
  type PublicCompareKind,
} from "./public-comparison-items";

type CompareSelections = Record<PublicCompareKind, PublicCompareItem[]>;

interface PublicComparisonContextValue {
  add: (item: PublicCompareItem) => void;
  contains: (kind: PublicCompareKind, id: string) => boolean;
  seed: (kind: PublicCompareKind, items: PublicCompareItem[]) => void;
}

const storageKey = "actorconsole:public-comparison";
const emptySelections = (): CompareSelections => ({ builder: [], actor: [] });
const PublicComparisonContext = createContext<PublicComparisonContextValue | null>(null);

export function PublicComparisonProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const initialPathname = useRef(pathname).current;
  const [selections, setSelections] = useState<CompareSelections>(emptySelections);
  const [hydrated, setHydrated] = useState(false);
  const [activeKind, setActiveKind] = useState<PublicCompareKind>("builder");

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<CompareSelections>;
        const valid = (kind: PublicCompareKind) =>
          (Array.isArray(parsed[kind]) ? parsed[kind] : [])
            .filter(
              (item): item is PublicCompareItem =>
                item?.kind === kind &&
                typeof item.id === "string" &&
                typeof item.title === "string" &&
                item.metrics &&
                typeof item.metrics === "object",
            )
            .slice(0, 5);
        const restored = { builder: valid("builder"), actor: valid("actor") };
        const pageKind = initialPathname.startsWith("/actors/compare")
          ? "actor"
          : initialPathname.startsWith("/builders/compare")
            ? new URLSearchParams(window.location.search).get("kind") === "actor"
              ? "actor"
              : "builder"
            : null;
        setSelections((previous) => ({
          builder: pageKind === "builder" ? previous.builder : restored.builder,
          actor: pageKind === "actor" ? previous.actor : restored.actor,
        }));
        if (
          restored.actor.length &&
          (!restored.builder.length || initialPathname.includes("/actors/"))
        ) {
          setActiveKind("actor");
        }
      }
    } catch {
      window.sessionStorage.removeItem(storageKey);
    }
    setHydrated(true);
  }, [initialPathname]);

  useEffect(() => {
    if (hydrated) window.sessionStorage.setItem(storageKey, JSON.stringify(selections));
  }, [hydrated, selections]);

  useEffect(() => {
    const other: PublicCompareKind = activeKind === "actor" ? "builder" : "actor";
    if (!selections[activeKind].length && selections[other].length) setActiveKind(other);
  }, [activeKind, selections]);

  const seed = useCallback((kind: PublicCompareKind, items: PublicCompareItem[]) => {
    setSelections((previous) => ({ ...previous, [kind]: items.slice(0, 5) }));
    setActiveKind(kind);
  }, []);

  const value = useMemo<PublicComparisonContextValue>(
    () => ({
      add(item) {
        setActiveKind(item.kind);
        const alreadySelected = selections[item.kind].some((selected) => selected.id === item.id);
        const selectedWindow = selections[item.kind][0]?.window;
        if (!alreadySelected && selections[item.kind].length >= 5) {
          toast.info(
            `Compare up to five ${item.kind === "actor" ? "Actors" : "builders"} at a time`,
          );
          router.push(
            publicComparisonHref(
              item.kind,
              selections[item.kind].map((selected) => selected.id),
              selectedWindow,
            ),
          );
          return;
        }
        const nextItems = alreadySelected
          ? selections[item.kind]
          : [...selections[item.kind], { ...item, window: selectedWindow ?? item.window }];
        setSelections((previous) => ({
          ...previous,
          [item.kind]: nextItems,
        }));
        router.push(
          publicComparisonHref(
            item.kind,
            nextItems.map((selected) => selected.id),
            selectedWindow ?? item.window,
          ),
        );
      },
      contains: (kind, id) => selections[kind].some((item) => item.id === id),
      seed,
    }),
    [selections, seed, router],
  );

  const active = selections[activeKind];
  const otherKind: PublicCompareKind = activeKind === "actor" ? "builder" : "actor";
  const showTray =
    !pathname.startsWith("/builders/compare") &&
    !pathname.startsWith("/actors/compare") &&
    (selections.builder.length > 0 || selections.actor.length > 0);
  const noun = activeKind === "actor" ? "Actor" : "builder";

  return (
    <PublicComparisonContext.Provider value={value}>
      <div className={showTray ? "pb-24" : undefined}>{children}</div>
      {showTray ? (
        <div
          className="border-border bg-card text-card-foreground fixed bottom-3 left-1/2 z-40 flex w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 flex-wrap items-center justify-between gap-3 border px-4 py-3 shadow-xl sm:bottom-5 sm:px-5"
          role="region"
          aria-label="Comparison selection"
        >
          <div className="min-w-0">
            <p className="font-semibold">
              {active.length} {noun}
              {active.length === 1 ? "" : "s"} selected
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {active.length
                ? active.map((item) => item.title).join(" · ")
                : `Choose ${noun}s to compare`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selections[otherKind].length ? (
              <Button size="sm" variant="ghost" onClick={() => setActiveKind(otherKind)}>
                {selections[otherKind].length} {otherKind === "actor" ? "Actors" : "builders"} saved
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={!active.length}
              onClick={() =>
                router.push(
                  publicComparisonHref(
                    activeKind,
                    active.map((item) => item.id),
                    active[0]?.window,
                  ),
                )
              }
            >
              <GitCompareArrows className="mr-1.5 h-4 w-4" /> Compare selected
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!active.length}
              onClick={() => setSelections((previous) => ({ ...previous, [activeKind]: [] }))}
            >
              <X className="mr-1 h-4 w-4" /> Clear
            </Button>
          </div>
        </div>
      ) : null}
    </PublicComparisonContext.Provider>
  );
}

export function PublicCompareButton({
  item,
  className,
}: {
  item: PublicCompareItem;
  className?: string;
}) {
  const context = useContext(PublicComparisonContext);
  if (!context) return null;
  const selected = context.contains(item.kind, item.id);
  return (
    <Button
      type="button"
      size="sm"
      variant={selected ? "secondary" : "outline"}
      className={className}
      onClick={() => context.add(item)}
      aria-label={`${selected ? "Open comparison for" : "Compare"} ${item.title}`}
    >
      <GitCompareArrows className="mr-1.5 h-4 w-4" /> {selected ? "In comparison" : "Compare"}
    </Button>
  );
}

export function PublicComparisonPageSelection({
  kind,
  items,
}: {
  kind: PublicCompareKind;
  items: PublicCompareItem[];
}) {
  const context = useContext(PublicComparisonContext);
  const seed = context?.seed;
  const signature = JSON.stringify(items);
  useEffect(() => {
    if (seed) seed(kind, items);
    // The serialized items change only when the comparison URL or its data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, seed, signature]);
  return null;
}
