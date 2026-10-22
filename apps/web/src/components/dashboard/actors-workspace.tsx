"use client";

import { navigateInApp } from "@/lib/client-navigation";

import type { ActorEarnings } from "@actorconsole/shared/actor-earnings";
import { EarningsBand } from "@/components/intelligence/earnings-summary";
import {
  useIntelligence,
  WorkspaceState,
  type WorkspaceEarningsData,
} from "@/components/intelligence/workspace-data";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  CheckSquare2,
  PlayCircle,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-base";
import { ActorCardActions } from "@/components/dashboard/actor-card-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { CollectionViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";
import { ItemsPerPageSelect } from "@/components/ui/items-per-page";
import { refreshWorkspaceActors, WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
import { WORKSPACE_CHANGED_EVENT } from "@/components/dashboard/onboarding-gate";
import {
  DashboardAsyncState,
  ResponsiveFilterBar,
  SelectionActionBar,
} from "@/components/dashboard/dashboard-workbench";
import { DEFAULT_PAGE_SIZE, normalizePageSize } from "@/lib/page-size";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type OptimizationField = "title" | "description" | "pricing";

const improvementFieldOptions: Array<{
  key: OptimizationField;
  label: string;
  description: string;
}> = [
  { key: "title", label: "Title", description: "Rewrite the Store title." },
  { key: "description", label: "Description", description: "Rewrite Store summary copy." },
  {
    key: "pricing",
    label: "Pay-per-event pricing",
    description: "Propose Actor.charge events and prices.",
  },
];

type Actor = {
  id: string;
  username: string;
  actorName: string;
  apifyActorId: string;
  title: string | null;
  description: string | null;
  publishReady?: boolean | null;
  hasDescription?: boolean | null;
  hasReadme?: boolean | null;
  hasInputSchema?: boolean | null;
  hasOutputSchema?: boolean | null;
  hasKeyValueSchema?: boolean | null;
  hasTaggedBuild?: boolean | null;
  hasPublicProfile?: boolean | null;
  hasVerifiedEmail?: boolean | null;
  hasNonDisposableEmail?: boolean | null;
  readinessSyncedAt?: string | null;
  updatedAt?: string;
  effectivePictureUrl?: string | null;
  pictureSource?: "actor" | "website" | "fallback";
  snapshots?: Array<{ runs30d?: number | null; usersTotal?: number | null }>;
  insightSnapshots?: Array<{ totalRuns?: number | null; totalUsers?: number | null }>;
};

type ActorInfo = {
  title?: string | null;
  description?: string | null;
  stats?: { totalRuns?: number | null; totalUsers?: number | null } | null;
};

type ActorRecord = {
  actor: Actor;
  info: ActorInfo | null;
};

type OptimizationSummary = {
  id: string;
  runId: string;
  actorId: string;
  status: string;
  currentScore: number | null;
  proposedScore: number | null;
  improvementPoints: number | null;
  improvementPercent: number | null;
};

type ApiStatus = {
  connected: boolean;
  apiKeyConfigured?: boolean;
};

type ActorSort = "updated-desc" | "updated-asc" | "name-asc" | "name-desc";
type ActorReadinessFilter =
  | "all"
  | "ready"
  | "needs-attention"
  | "unknown"
  | "missing-description"
  | "missing-readme"
  | "missing-input-schema"
  | "missing-output-schema"
  | "missing-key-value-store-schema"
  | "missing-tagged-build"
  | "missing-public-profile"
  | "email-not-verified"
  | "disposable-email";

const actorSortLabels: Record<ActorSort, string> = {
  "updated-desc": "Recently updated",
  "updated-asc": "Oldest updated",
  "name-asc": "Name A–Z",
  "name-desc": "Name Z–A",
};

const actorReadinessLabels: Record<ActorReadinessFilter, string> = {
  all: "All readiness",
  ready: "Ready to publish",
  "needs-attention": "Needs attention",
  unknown: "Not checked",
  "missing-description": "Missing description",
  "missing-readme": "Missing README",
  "missing-input-schema": "Missing input schema",
  "missing-output-schema": "Missing output schema",
  "missing-key-value-store-schema": "Missing key-value schema",
  "missing-tagged-build": "Missing tagged build",
  "missing-public-profile": "Public profile required",
  "email-not-verified": "Email not verified",
  "disposable-email": "Disposable email",
};

type ActorPortfolioFilter = ActorReadinessFilter | "pending-logos";

const actorPortfolioFilterLabels: Record<ActorPortfolioFilter, string> = {
  ...actorReadinessLabels,
  "pending-logos": "Pending logos",
};

function normalizeReadinessFilter(value: string | null): ActorReadinessFilter {
  return value && value in actorReadinessLabels ? (value as ActorReadinessFilter) : "all";
}

function missingReadinessLabels(actor: Actor) {
  if (!actor.readinessSyncedAt) return ["Not checked"];
  return [
    actor.hasDescription === false ? "Description" : null,
    actor.hasReadme === false ? "README" : null,
    actor.hasInputSchema === false ? "Input schema" : null,
    actor.hasOutputSchema === false ? "Output schema" : null,
    actor.hasKeyValueSchema === false ? "Key-value schema" : null,
    actor.hasTaggedBuild === false ? "Tagged build" : null,
    actor.hasPublicProfile === false ? "Public profile" : null,
    actor.hasVerifiedEmail === false ? "Verified email" : null,
    actor.hasNonDisposableEmail === false ? "Non-disposable email" : null,
  ].filter((value): value is string => Boolean(value));
}

function normalizeActorSort(value: string | null): ActorSort {
  if (value === "updated-asc" || value === "name-asc" || value === "name-desc") return value;
  return "updated-desc";
}

function formatActorDate(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

function ActorThumbnail({
  actor,
  title,
  size = "md",
}: {
  actor: Actor;
  title: string;
  size?: "sm" | "md";
}) {
  const initials =
    (title || actor.actorName)
      .split(/\s+|[-_]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "A";
  return (
    <Avatar
      className={`${size === "sm" ? "h-9 w-9" : "h-11 w-11"} border-border/70 bg-muted/60 rounded-lg border`}
      data-picture-source={actor.pictureSource ?? "fallback"}
      data-picture-url={actor.effectivePictureUrl ?? undefined}
    >
      {actor.effectivePictureUrl ? (
        <AvatarImage
          src={actor.effectivePictureUrl}
          alt={`${title} thumbnail`}
          className="object-contain p-1"
        />
      ) : null}
      <AvatarFallback className="rounded-lg text-xs">{initials}</AvatarFallback>
    </Avatar>
  );
}

function ActorsGridSkeleton() {
  return (
    <div
      className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
      aria-label="Loading actors"
      aria-live="polite"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="border-border/80 bg-card rounded-md border p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <div className="mt-4 flex gap-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ActorsTableSkeleton() {
  return (
    <div
      className="border-border/60 bg-card overflow-hidden rounded-md border"
      aria-label="Loading actors"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-muted/40 border-border/60 border-b text-left text-xs">
            <tr>
              {Array.from({ length: 8 }).map((_, index) => (
                <th key={index} className="px-4 py-3">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border/50 divide-y">
            {Array.from({ length: 6 }).map((_, row) => (
              <tr key={row}>
                <td className="px-4 py-4">
                  <Skeleton className="h-4 w-4" />
                </td>
                <td className="px-4 py-4">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="mt-2 h-3 w-32" />
                </td>
                <td className="px-4 py-4">
                  <Skeleton className="h-5 w-14 rounded-full" />
                </td>
                <td className="px-4 py-4">
                  <Skeleton className="h-3 w-28" />
                </td>
                <td className="px-4 py-4">
                  <Skeleton className="h-3 w-24" />
                </td>
                <td className="px-4 py-4">
                  <Skeleton className="h-3 w-20" />
                </td>
                <td className="px-4 py-4">
                  <Skeleton className="h-5 w-24 rounded-full" />
                </td>
                <td className="px-4 py-4">
                  <Skeleton className="ml-auto h-8 w-8" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActorsTable({
  records,
  onRenamed,
  selectedActorIds,
  onSelectActor,
  onSelectPage,
  optimizationByActor,
  earningsByActor,
}: {
  earningsByActor: Map<string, ActorEarnings>;
  records: ActorRecord[];
  onRenamed: () => void;
  selectedActorIds: Set<string>;
  onSelectActor: (actorId: string, selected: boolean) => void;
  onSelectPage: (actorIds: string[], selected: boolean) => void;
  optimizationByActor: Map<string, OptimizationSummary>;
}) {
  const allSelected =
    records.length > 0 && records.every(({ actor }) => selectedActorIds.has(actor.id));
  return (
    <div className="border-border/60 bg-card overflow-hidden rounded-md border">
      <div className="divide-border/60 divide-y md:hidden">
        {records.map(({ actor, info }) => {
          const title = info?.title ?? actor.title ?? actor.actorName;
          const optimization = optimizationByActor.get(actor.id);
          const readinessLabels = missingReadinessLabels(actor);
          return (
            <article key={actor.id} className="p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedActorIds.has(actor.id)}
                  onChange={(event) => onSelectActor(actor.id, event.target.checked)}
                  aria-label={`Select ${title}`}
                  className="mt-1"
                />
                <ActorThumbnail actor={actor} title={title} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/actors/${actor.id}`}
                    className="block truncate text-sm font-semibold hover:underline"
                  >
                    {title}
                  </Link>
                  <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                    {actor.username}/{actor.actorName}
                  </p>
                  <div className="mt-3">
                    <p className="text-muted-foreground mb-2 text-xs">Est. monthly revenue</p>
                    <EarningsBand value={earningsByActor.get(actor.id)} compact />
                  </div>
                </div>
                <ActorCardActions
                  actorId={actor.id}
                  actorName={actor.actorName}
                  initialTitle={actor.title}
                  onRenamed={onRenamed}
                  alwaysVisible
                />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Usage</dt>
                  <dd className="mt-1 font-medium">
                    {info?.stats
                      ? `${(info.stats.totalRuns ?? 0).toLocaleString("en-IN")} runs`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd className="mt-1 font-medium">{formatActorDate(actor.updatedAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Listing quality</dt>
                  <dd className="mt-1 font-medium">
                    {optimization?.currentScore != null
                      ? `${optimization.currentScore}%`
                      : optimization
                        ? optimization.status.replaceAll("_", " ").toLowerCase()
                        : "Not audited"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Readiness</dt>
                  <dd className="mt-1">
                    {readinessLabels.length === 0 ? (
                      <Badge variant="success">Ready</Badge>
                    ) : (
                      <Badge variant="warning">{readinessLabels.length} issues</Badge>
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1120px] text-sm" aria-label="Actors">
          <caption className="sr-only">Actors in this workspace</caption>
          <thead className="bg-muted/40 text-muted-foreground border-border/60 border-b text-left text-xs">
            <tr>
              <th scope="col" className="w-10 px-4 py-3 font-medium">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) =>
                    onSelectPage(
                      records.map(({ actor }) => actor.id),
                      event.target.checked,
                    )
                  }
                  aria-label="Select all Actors on this page"
                />
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Actor
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Source
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Usage
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Updated
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Listing quality
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Publish readiness
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-border/50 divide-y">
            {records.map(({ actor, info }) => {
              const title = info?.title ?? actor.title ?? actor.actorName;
              const optimization = optimizationByActor.get(actor.id);
              return (
                <tr key={actor.id} className="hover:bg-muted/30 align-top transition-colors">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedActorIds.has(actor.id)}
                      onChange={(event) => onSelectActor(actor.id, event.target.checked)}
                      aria-label={`Select ${title}`}
                    />
                  </td>
                  <td className="max-w-[280px] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ActorThumbnail actor={actor} title={title} size="sm" />
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/actors/${actor.id}`}
                          className="text-foreground block truncate font-medium hover:underline"
                        >
                          {title}
                        </Link>
                        <p className="text-muted-foreground mt-1 truncate text-xs">
                          {actor.username}/{actor.actorName}
                        </p>
                        <div className="mt-3">
                          <p className="text-muted-foreground mb-2 text-xs">Est. monthly revenue</p>
                          <EarningsBand value={earningsByActor.get(actor.id)} compact />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">Apify</Badge>
                  </td>
                  <td className="text-muted-foreground whitespace-nowrap px-4 py-3 text-xs">
                    {info?.stats ? (
                      <span>
                        {(info.stats.totalRuns ?? 0).toLocaleString("en-IN")} runs ·{" "}
                        {(info.stats.totalUsers ?? 0).toLocaleString("en-IN")} users
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-muted-foreground whitespace-nowrap px-4 py-3 text-xs">
                    {formatActorDate(actor.updatedAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {optimization?.currentScore != null ? (
                      <Link
                        href={`/dashboard/actors/optimization/${optimization.runId}`}
                        className="font-medium hover:underline"
                      >
                        {optimization.currentScore}%
                        {optimization.improvementPoints != null &&
                        optimization.improvementPoints > 0
                          ? ` → ${optimization.proposedScore}% (+${optimization.improvementPoints})`
                          : ""}
                      </Link>
                    ) : optimization ? (
                      <span className="text-muted-foreground">
                        {optimization.status.replaceAll("_", " ").toLowerCase()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not audited</span>
                    )}
                  </td>
                  <td className="max-w-[280px] px-4 py-3 text-xs">
                    {missingReadinessLabels(actor).length === 0 ? (
                      <Badge variant="success">Ready</Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {missingReadinessLabels(actor).map((label) => (
                          <Badge key={label} variant="warning">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ActorCardActions
                      actorId={actor.id}
                      actorName={actor.actorName}
                      initialTitle={actor.title}
                      onRenamed={onRenamed}
                      alwaysVisible
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function updateActorsUrl(
  query: string,
  page: number,
  sort: ActorSort,
  pageSize: number,
  readiness: ActorReadinessFilter,
  pendingLogosOnly: boolean,
) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  if (sort !== "updated-desc") params.set("sort", sort);
  if (pageSize !== DEFAULT_PAGE_SIZE) params.set("limit", String(pageSize));
  if (readiness !== "all") params.set("readiness", readiness);
  if (pendingLogosOnly) params.set("logoStatus", "pending");
  const suffix = params.toString();
  window.history.replaceState(
    null,
    "",
    suffix ? `/dashboard/actors?${suffix}` : "/dashboard/actors",
  );
}

export type ActorsWorkspaceInitialParams = Record<string, string | undefined>;

export function ActorsWorkspace({
  initialParams = {},
}: {
  initialParams?: ActorsWorkspaceInitialParams;
}) {
  // Query parameters are supplied by the server page so the server render and
  // the first client render are byte-for-byte identical. Reading
  // window.location during render caused React hydration error #418 whenever
  // a filtered Actors URL was opened directly.
  const earnings = useIntelligence<WorkspaceEarningsData>("/earnings");
  const earningsByActor = new Map(earnings.data?.items.map((actor) => [actor.id, actor.earnings]));
  const initialQuery = initialParams.q?.trim() ?? "";
  const initialPage = Math.max(1, Number(initialParams.page) || 1);
  const initialSort = normalizeActorSort(initialParams.sort ?? null);
  const initialReadiness = normalizeReadinessFilter(initialParams.readiness ?? null);
  const notice = initialParams.msg;
  const [inputValue, setInputValue] = useState(initialQuery);
  const [view, setView] = useState<CollectionViewMode>("list");
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const [sort, setSort] = useState<ActorSort>(initialSort);
  const [readiness, setReadiness] = useState<ActorReadinessFilter>(initialReadiness);
  const [pendingLogosOnly, setPendingLogosOnly] = useState(initialParams.logoStatus === "pending");
  const [pageSize, setPageSize] = useState(() => normalizePageSize(initialParams.limit));
  const [records, setRecords] = useState<ActorRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedActorIds, setSelectedActorIds] = useState<Set<string>>(() => new Set());
  const [optimizationByActor, setOptimizationByActor] = useState<Map<string, OptimizationSummary>>(
    () => new Map(),
  );
  const [startingAudit, setStartingAudit] = useState(false);
  const [improvementDialogOpen, setImprovementDialogOpen] = useState(false);
  const [improvementFields, setImprovementFields] = useState<OptimizationField[]>(
    improvementFieldOptions.map(({ key }) => key).filter((key) => key !== "pricing"),
  );
  const [selectingAll, setSelectingAll] = useState(false);
  const requestId = useRef(0);
  const recordsRef = useRef<ActorRecord[]>([]);
  const hasLoadedApiStatus = useRef(false);
  const syncController = useRef<AbortController | null>(null);
  const hasActiveFilters = Boolean(query || readiness !== "all" || pendingLogosOnly);

  const clearActorSelection = useCallback(() => {
    setSelectedActorIds(new Set());
  }, []);

  useEffect(() => {
    if (window.localStorage.getItem("actorconsole:actors-view") === "grid") setView("grid");
  }, []);

  useEffect(() => {
    clearActorSelection();
  }, [clearActorSelection, page, pageSize, pendingLogosOnly, query, readiness, sort]);

  useEffect(() => {
    window.addEventListener(WORKSPACE_CHANGED_EVENT, clearActorSelection);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, clearActorSelection);
  }, [clearActorSelection]);

  useEffect(() => {
    const cancelSync = () => {
      syncController.current?.abort();
      syncController.current = null;
      setSyncing(false);
      setSyncMessage(null);
      setSyncError(null);
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, cancelSync);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, cancelSync);
      syncController.current?.abort();
    };
  }, []);

  const loadActors = useCallback(
    async (
      nextQuery: string,
      nextPage: number,
      nextSort: ActorSort,
      nextPageSize: number,
      nextReadiness: ActorReadinessFilter,
    ) => {
      const currentRequest = ++requestId.current;
      const hasCachedRecords = recordsRef.current.length > 0;
      setLoading(!hasCachedRecords);
      setRefreshing(hasCachedRecords);
      setError(null);

      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(nextPageSize),
        sort: nextSort,
        readiness: nextReadiness,
      });
      if (nextQuery) params.set("q", nextQuery);
      if (pendingLogosOnly) params.set("logoStatus", "pending");
      const loadApiStatus = !hasLoadedApiStatus.current;

      try {
        if (loadApiStatus) {
          void fetch(`${API_BASE_URL}/apify/status`, {
            cache: "no-store",
            credentials: "include",
          })
            .then(async (statusResponse) => {
              if (!statusResponse.ok || currentRequest !== requestId.current) return;
              const statusBody = (await statusResponse.json()) as { data: ApiStatus };
              setApiStatus(statusBody.data);
              hasLoadedApiStatus.current = true;
            })
            .catch(() => undefined);
        }
        const actorsResponse = await fetch(
          `${API_BASE_URL}/actors/dashboard-list?${params.toString()}`,
          {
            cache: "no-store",
            credentials: "include",
          },
        );

        if (!actorsResponse.ok) throw new Error("Could not load actors from the API");
        const actorsBody = (await actorsResponse.json()) as {
          data: { items: Actor[]; total: number };
        };
        const nextRecords = actorsBody.data.items.map((actor) => {
          const storeSnapshot = actor.snapshots?.[0];
          const insightSnapshot = actor.insightSnapshots?.[0];
          return {
            actor,
            info: {
              title: actor.title,
              description: actor.description,
              stats: {
                totalRuns: storeSnapshot?.runs30d ?? insightSnapshot?.totalRuns ?? null,
                totalUsers: storeSnapshot?.usersTotal ?? insightSnapshot?.totalUsers ?? null,
              },
            },
          } satisfies ActorRecord;
        });

        if (currentRequest !== requestId.current) return;
        setRecords(nextRecords);
        recordsRef.current = nextRecords;
        setTotal(Number(actorsBody.data.total));
        if (nextRecords.length > 0) {
          void fetch(
            `${API_BASE_URL}/actors/optimization/summary?actorIds=${encodeURIComponent(nextRecords.map(({ actor }) => actor.id).join(","))}`,
            { cache: "no-store", credentials: "include" },
          )
            .then(async (response) => {
              if (!response.ok || currentRequest !== requestId.current) return;
              const body = (await response.json()) as { data: OptimizationSummary[] };
              setOptimizationByActor(new Map(body.data.map((item) => [item.actorId, item])));
            })
            .catch(() => undefined);
        } else {
          setOptimizationByActor(new Map());
        }
      } catch (loadError) {
        if (currentRequest !== requestId.current) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load actors");
      } finally {
        if (currentRequest === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [pendingLogosOnly],
  );

  useEffect(() => {
    void loadActors(query, page, sort, pageSize, readiness);
  }, [loadActors, page, pageSize, query, readiness, sort]);

  useEffect(() => {
    const changeWorkspace = () => {
      // A workspace switch changes the API cookie without remounting this
      // page. Invalidate pending responses and the old workspace's count.
      requestId.current += 1;
      recordsRef.current = [];
      hasLoadedApiStatus.current = false;
      setRecords([]);
      setTotal(0);
      setApiStatus(null);
      setLoading(true);
      if (page !== 1) {
        setPage(1);
        updateActorsUrl(query, 1, sort, pageSize, readiness, pendingLogosOnly);
      } else {
        void loadActors(query, 1, sort, pageSize, readiness);
      }
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, changeWorkspace);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, changeWorkspace);
  }, [loadActors, page, pageSize, pendingLogosOnly, query, readiness, sort]);

  useEffect(() => {
    const refresh = () => {
      clearActorSelection();
      if (page !== 1) {
        setPage(1);
        updateActorsUrl(query, 1, sort, pageSize, readiness, pendingLogosOnly);
      } else {
        void loadActors(query, page, sort, pageSize, readiness);
      }
    };
    window.addEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refresh);
    return () => window.removeEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refresh);
  }, [clearActorSelection, loadActors, page, pageSize, pendingLogosOnly, query, readiness, sort]);

  async function refreshFromApify() {
    if (syncController.current || !apiStatus?.apiKeyConfigured) return;
    const controller = new AbortController();
    syncController.current = controller;
    setSyncing(true);
    setSyncError(null);
    setSyncMessage("Starting refresh from Apify…");
    try {
      const state = await refreshWorkspaceActors({
        signal: controller.signal,
        onQueued: () => setSyncMessage("Syncing actors from Apify…"),
      });
      if (controller.signal.aborted) return;
      if (state === "completed") {
        setSyncMessage("Actors refreshed from Apify.");
      } else {
        setSyncMessage(null);
        setSyncError(
          state === "failed"
            ? "Refresh failed. Try again or check your Apify connection."
            : "Refresh has not completed. Click Refresh from Apify to try again or check its progress.",
        );
      }
    } catch {
      if (!controller.signal.aborted) {
        setSyncMessage(null);
        setSyncError("Could not refresh actors. Check your connection and try again.");
      }
    } finally {
      if (syncController.current === controller) {
        syncController.current = null;
        setSyncing(false);
      }
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = inputValue.trim();
    setQuery(nextQuery);
    setPage(1);
    updateActorsUrl(nextQuery, 1, sort, pageSize, readiness, pendingLogosOnly);
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
    updateActorsUrl(query, nextPage, sort, pageSize, readiness, pendingLogosOnly);
  }

  function updateSort(nextSort: ActorSort) {
    setSort(nextSort);
    setPage(1);
    updateActorsUrl(query, 1, nextSort, pageSize, readiness, pendingLogosOnly);
  }

  function updatePageSize(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
    updateActorsUrl(query, 1, sort, nextPageSize, readiness, pendingLogosOnly);
  }

  function updatePortfolioFilter(nextFilter: ActorPortfolioFilter) {
    const nextPendingLogosOnly = nextFilter === "pending-logos";
    const nextReadiness = nextPendingLogosOnly ? "all" : nextFilter;
    setPendingLogosOnly(nextPendingLogosOnly);
    setReadiness(nextReadiness);
    setPage(1);
    updateActorsUrl(query, 1, sort, pageSize, nextReadiness, nextPendingLogosOnly);
  }

  function updateView(nextView: CollectionViewMode) {
    setView(nextView);
    window.localStorage.setItem("actorconsole:actors-view", nextView);
  }

  function selectActor(actorId: string, selected: boolean) {
    setSelectedActorIds((current) => {
      const next = new Set(current);
      if (selected) next.add(actorId);
      else next.delete(actorId);
      return next;
    });
  }

  function selectPageActors(actorIds: string[], selected: boolean) {
    setSelectedActorIds((current) => {
      const next = new Set(current);
      for (const actorId of actorIds) {
        if (selected) next.add(actorId);
        else next.delete(actorId);
      }
      return next;
    });
  }

  async function selectAllMatchingActors() {
    setSelectingAll(true);
    try {
      const params = new URLSearchParams({ readiness });
      if (query) params.set("q", query);
      const response = await fetch(
        `${API_BASE_URL}/actors/dashboard-selection?${params.toString()}`,
        { cache: "no-store", credentials: "include" },
      );
      const body = (await response.json()) as {
        data?: { actorIds?: string[] };
        error?: { message?: string };
      };
      if (!response.ok || !body.data?.actorIds) {
        throw new Error(body.error?.message ?? "Could not select matching Actors");
      }
      setSelectedActorIds(new Set(body.data.actorIds));
      toast.success(`${body.data.actorIds.length} matching Actors selected`);
    } catch (selectionError) {
      toast.error(
        selectionError instanceof Error
          ? selectionError.message
          : "Could not select matching Actors",
      );
    } finally {
      setSelectingAll(false);
    }
  }

  async function startOptimizationAudit() {
    if (selectedActorIds.size === 0) {
      toast.error("Select at least one Actor to audit");
      return;
    }
    setStartingAudit(true);
    try {
      const response = await fetch(`${API_BASE_URL}/actors/optimization/runs`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actorIds: [...selectedActorIds],
          kind: "CUSTOM",
          fields: improvementFields,
        }),
      });
      const body = (await response.json()) as {
        data?: { runId: string };
        error?: { message?: string };
      };
      if (!response.ok || !body.data?.runId) {
        throw new Error(body.error?.message ?? "Could not start the Actor audit");
      }
      navigateInApp(`/dashboard/actors/optimization/${body.data.runId}`);
    } catch (auditError) {
      toast.error(
        auditError instanceof Error ? auditError.message : "Could not start the Actor audit",
      );
      setStartingAudit(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const renderActorFilters = () => (
    <>
      <label className="text-muted-foreground flex items-center gap-2 text-xs">
        <span>Sort</span>
        <select
          value={sort}
          onChange={(event) => updateSort(normalizeActorSort(event.target.value))}
          aria-label="Sort actors"
          className="border-input bg-background text-foreground h-9 w-full rounded-sm border px-3 text-sm"
        >
          {(Object.keys(actorSortLabels) as ActorSort[]).map((option) => (
            <option key={option} value={option}>
              {actorSortLabels[option]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-muted-foreground flex items-center gap-2 text-xs">
        <span>Show</span>
        <select
          value={pendingLogosOnly ? "pending-logos" : readiness}
          onChange={(event) => updatePortfolioFilter(event.target.value as ActorPortfolioFilter)}
          aria-label="Filter Actor readiness"
          className="border-input bg-background text-foreground h-9 w-full rounded-sm border px-3 text-sm"
        >
          {(Object.keys(actorPortfolioFilterLabels) as ActorPortfolioFilter[]).map((option) => (
            <option key={option} value={option}>
              {actorPortfolioFilterLabels[option]}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  return (
    <div className="space-y-8">
      <WorkspaceState {...earnings} retry={earnings.refresh} />
      {notice === "add-actor-first" ? (
        <div
          className="border-signal-orange/30 bg-signal-orange/10 text-signal-orange rounded-lg border px-4 py-3 text-sm"
          role="status"
        >
          Connect Apify and sync at least one Actor before creating a publishing schedule.
        </div>
      ) : null}

      <div className="dashboard-filter-rail border-border/70 bg-card/95 flex flex-col gap-3 rounded-sm border p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form
            onSubmit={submitSearch}
            className="flex min-w-0 flex-1 items-center gap-2 lg:max-w-md"
          >
            <input
              name="q"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              className="border-input bg-background h-9 min-w-0 flex-1 rounded-sm border px-3 text-sm"
              placeholder="Search actors"
              aria-label="Search actors"
            />
            <button
              className="border-input bg-background h-9 rounded-sm border px-3 text-sm"
              type="submit"
              disabled={loading}
            >
              Search
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshFromApify()}
              disabled={syncing || !apiStatus?.apiKeyConfigured}
              aria-busy={syncing}
              title={
                !apiStatus?.apiKeyConfigured
                  ? "Connect an Apify API key to refresh actors"
                  : undefined
              }
            >
              <RefreshCw
                className={syncing ? "motion-safe:animate-spin" : undefined}
                aria-hidden="true"
              />
              {syncing ? "Refreshing…" : "Refresh from Apify"}
            </Button>
            <ViewModeToggle value={view} onValueChange={updateView} label="Actors view" />
            <div className="hidden xl:block">
              <Popover.Root>
                <Popover.Trigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <SlidersHorizontal className="h-4 w-4" /> Sort &amp; filter
                  </Button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    align="end"
                    sideOffset={8}
                    className="border-border bg-card z-[60] grid w-72 gap-3 rounded-md border p-4 shadow-lg"
                  >
                    {renderActorFilters()}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
            <ResponsiveFilterBar
              desktopVisible={false}
              mobileLabel="Sort and filter Actors"
              activeCount={
                (readiness !== "all" || pendingLogosOnly ? 1 : 0) +
                (sort !== "updated-desc" ? 1 : 0)
              }
              renderFilters={renderActorFilters}
            />
            {apiStatus && !apiStatus.apiKeyConfigured ? (
              <Button variant="signal" asChild>
                <Link href="/dashboard/apify">
                  {apiStatus.connected ? "Add API key" : "Connect Apify"}
                </Link>
              </Button>
            ) : !apiStatus ? (
              <Skeleton className="h-9 w-32 rounded-sm" />
            ) : null}
          </div>
        </div>
        {syncError ? (
          <p className="text-destructive text-sm" role="alert">
            {syncError}
          </p>
        ) : syncMessage ? (
          <p className="text-muted-foreground text-sm" role="status">
            {syncMessage}
          </p>
        ) : null}
        <div className="border-border/60 flex items-center justify-between border-t pt-3">
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {loading && total === 0
              ? "Loading Actors…"
              : `${total} Actor${total === 1 ? "" : "s"} matching`}
          </p>
          <p className="text-muted-foreground/60 hidden text-xs sm:block">
            Sorted by {actorSortLabels[sort].toLowerCase()}
          </p>
        </div>
      </div>

      <section aria-busy={loading} aria-live="polite">
        {loading ? (
          view === "list" ? (
            <ActorsTableSkeleton />
          ) : (
            <ActorsGridSkeleton />
          )
        ) : records.length === 0 && error ? (
          <Panel variant="default" radius="panel">
            <DashboardAsyncState
              status="error"
              title="Could not load Actors"
              description={error}
              onRetry={() => void loadActors(query, page, sort, pageSize, readiness)}
            />
          </Panel>
        ) : records.length === 0 ? (
          <Panel variant="default" radius="panel">
            <EmptyState
              title={
                hasActiveFilters
                  ? "No actors match these filters"
                  : apiStatus?.apiKeyConfigured
                    ? "No actors synced yet"
                    : "Apify API key required"
              }
              description={
                hasActiveFilters
                  ? "Try a different search or clear the readiness filter to see the Actors in this workspace."
                  : apiStatus?.apiKeyConfigured
                    ? "Actors owned by the connected Apify account are synced automatically. New Actors will appear here after the next platform sync."
                    : apiStatus?.connected
                      ? "Publishing credentials are connected, but listing and syncing your Actors requires an Apify API key."
                      : "Connect an Apify API key and sync your Actors to start optimizing."
              }
              action={
                hasActiveFilters
                  ? { label: "Clear filters", href: "/dashboard/actors" }
                  : apiStatus?.apiKeyConfigured
                    ? undefined
                    : {
                        label: apiStatus?.connected ? "Add API key" : "Connect Apify",
                        href: "/dashboard/apify",
                      }
              }
            />
          </Panel>
        ) : (
          <div>
            {refreshing ? (
              <DashboardAsyncState
                status="refreshing"
                title="Refreshing Actor inventory"
                description="Showing the cached portfolio while the latest Apify snapshot is fetched."
                className="mb-4"
              />
            ) : null}
            {error ? (
              <DashboardAsyncState
                status="warning"
                title="Showing cached Actor inventory"
                description={error}
                onRetry={() => void loadActors(query, page, sort, pageSize, readiness)}
                className="mb-4"
              />
            ) : null}
            <SelectionActionBar
              count={selectedActorIds.size}
              noun="Actor"
              description="Selection clears when the Actors view or workspace changes."
              onClear={clearActorSelection}
              className="mb-4"
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const pageIds = records.map(({ actor }) => actor.id);
                  const shouldSelect = !pageIds.every((id) => selectedActorIds.has(id));
                  selectPageActors(pageIds, shouldSelect);
                }}
              >
                <CheckSquare2 className="mr-2 h-4 w-4" />
                Select page
              </Button>
              {selectedActorIds.size < total ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void selectAllMatchingActors()}
                  disabled={selectingAll}
                >
                  {selectingAll ? (
                    <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                  ) : (
                    <CheckSquare2 className="mr-2 h-4 w-4" />
                  )}
                  Select all {total} results
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="signal"
                onClick={() => setImprovementDialogOpen(true)}
                disabled={selectedActorIds.size === 0 || startingAudit}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {startingAudit ? "Starting audit…" : "Generate improvements"}
              </Button>
            </SelectionActionBar>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-muted-foreground text-xs">
                Open an Actor to see its details. Select several to generate improvements together.
              </p>
            </div>
            {view === "list" ? (
              <ActorsTable
                records={records}
                onRenamed={() => void loadActors(query, page, sort, pageSize, readiness)}
                selectedActorIds={selectedActorIds}
                onSelectActor={selectActor}
                onSelectPage={selectPageActors}
                optimizationByActor={optimizationByActor}
                earningsByActor={earningsByActor}
              />
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {records.map(({ actor, info }) => (
                  <Card
                    key={actor.id}
                    variant="hover"
                    className={
                      view === "grid"
                        ? "group/card border-border/60 relative"
                        : "group/card relative rounded-none border-0 shadow-none"
                    }
                  >
                    <label className="bg-background/90 pointer-events-auto absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-md border shadow-sm">
                      <input
                        type="checkbox"
                        checked={selectedActorIds.has(actor.id)}
                        onChange={(event) => selectActor(actor.id, event.target.checked)}
                        aria-label={`Select ${info?.title ?? actor.title ?? actor.actorName}`}
                      />
                    </label>
                    <Link
                      href={`/dashboard/actors/${actor.id}`}
                      className="absolute inset-0 z-0 rounded-lg"
                      aria-label={`Open ${info?.title ?? actor.title ?? actor.actorName}`}
                    />
                    <CardHeader
                      className={
                        view === "grid"
                          ? "pointer-events-none relative z-10 space-y-3"
                          : "pointer-events-none relative z-10 gap-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0"
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <ActorThumbnail
                          actor={actor}
                          title={info?.title ?? actor.title ?? actor.actorName}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <CardTitle className="truncate text-base">
                              {info?.title ?? actor.title ?? actor.actorName}
                            </CardTitle>
                            <span className="pointer-events-auto">
                              <ActorCardActions
                                actorId={actor.id}
                                actorName={actor.actorName}
                                initialTitle={actor.title}
                                onRenamed={() =>
                                  void loadActors(query, page, sort, pageSize, readiness)
                                }
                              />
                            </span>
                          </div>
                          <p className="text-muted-foreground text-xs">
                            {actor.username}/{actor.actorName}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          Apify
                        </Badge>
                      </div>
                      {info?.stats ? (
                        <div className="text-muted-foreground flex items-center gap-3 text-xs">
                          <span className="inline-flex items-center gap-1">
                            <PlayCircle className="h-3.5 w-3.5" />
                            {(info.stats.totalRuns ?? 0).toLocaleString("en-IN")} runs
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {(info.stats.totalUsers ?? 0).toLocaleString("en-IN")} users
                          </span>
                        </div>
                      ) : null}
                      <div>
                        <p className="text-muted-foreground mb-2 text-xs">
                          Est. monthly creator revenue
                        </p>
                        <EarningsBand value={earningsByActor.get(actor.id)} compact />
                      </div>
                      {(info?.description ?? actor.description) ? (
                        <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                          {info?.description ?? actor.description}
                        </p>
                      ) : null}
                      {optimizationByActor.get(actor.id)?.currentScore != null ? (
                        <p className="text-muted-foreground text-xs">
                          Listing quality {optimizationByActor.get(actor.id)?.currentScore}% ·
                          potential {optimizationByActor.get(actor.id)?.proposedScore}%
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-1">
                        {missingReadinessLabels(actor).length === 0 ? (
                          <Badge variant="success">Ready to publish</Badge>
                        ) : (
                          missingReadinessLabels(actor).map((label) => (
                            <Badge key={label} variant="warning">
                              {label}
                            </Badge>
                          ))
                        )}
                      </div>
                    </CardHeader>
                    <CardContent
                      className={
                        view === "grid"
                          ? "pointer-events-none relative z-10"
                          : "pointer-events-none relative z-10 hidden sm:block"
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground/40 flex-1 text-center text-xs">
                          Click to open →
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {!loading && !error && total > 0 ? (
        <nav
          aria-label="Actors pagination"
          className="text-muted-foreground flex flex-col items-center justify-between gap-3 text-sm sm:flex-row"
        >
          <ItemsPerPageSelect value={pageSize} onChange={updatePageSize} label="Actors per page" />
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="hover:underline disabled:no-underline disabled:opacity-50"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
            >
              ← Previous
            </button>
            <span>
              Page {Math.min(page, totalPages)} of {totalPages}
            </span>
            <button
              type="button"
              className="hover:underline disabled:no-underline disabled:opacity-50"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
            >
              Next →
            </button>
          </div>
        </nav>
      ) : null}

      <Dialog open={improvementDialogOpen} onOpenChange={setImprovementDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose improvements to generate</DialogTitle>
            <DialogDescription>
              Generate one review run for {selectedActorIds.size} selected Actor
              {selectedActorIds.size === 1 ? "" : "s"}. Nothing changes on Apify until you approve
              individual fields on the run page.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {improvementFieldOptions.map((option) => {
              const checked = improvementFields.includes(option.key);
              const inputId = `optimization-field-${option.key}`;
              return (
                <label
                  key={option.key}
                  htmlFor={inputId}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors ${
                    checked ? "border-signal-orange bg-signal-orange/5" : "border-border/60"
                  }`}
                >
                  <span className="sr-only">Choose this optimization field</span>
                  <input
                    id={inputId}
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={(event) =>
                      setImprovementFields((current) =>
                        event.target.checked
                          ? [...new Set([...current, option.key])]
                          : current.filter((field) => field !== option.key),
                      )
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="text-muted-foreground block text-xs leading-relaxed">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImprovementDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void startOptimizationAudit()}
              disabled={startingAudit || improvementFields.length === 0}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {startingAudit ? "Starting generation…" : "Generate selected improvements"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
