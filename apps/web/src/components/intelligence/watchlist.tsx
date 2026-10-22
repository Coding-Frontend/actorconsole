"use client";
import { estimateActorEarnings } from "@actorconsole/shared/actor-earnings";
import { EarningsBand, EarningsMethod } from "./earnings-summary";
import { useState } from "react";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { PublicCompareButton } from "@/components/comparison/public-comparison-provider";
import type { PublicCompareItem } from "@/components/comparison/public-comparison-items";
import { downloadCsv } from "./research-tools";
import { intelligenceRequest, useIntelligence, WorkspaceState } from "./workspace-data";

interface Watch {
  id: string;
  alertsEnabled: boolean;
  checkedAt: string;
  baseline: { rank?: number | null };
  storeActor: {
    pricingInfos?: unknown;
    id: string;
    username: string;
    actorName: string;
    title: string | null;
    pictureUrl: string | null;
    description: string | null;
    users30Days: number | null;
    runs30Days: number | null;
    totalUsers: number | null;
    reviewRating: number | null;
    lastSeenAt: string;
    isPublic: boolean;
    isDeprecated: boolean;
  };
}
export function Watchlist() {
  const state = useIntelligence<Watch[]>("/watches");
  const [pending, setPending] = useState<string | null>(null);
  async function change(item: Watch, remove = false) {
    setPending(item.id);
    try {
      await intelligenceRequest(
        `/watches/${item.id}`,
        remove ? "DELETE" : "PATCH",
        remove ? undefined : { alertsEnabled: !item.alertsEnabled },
      );
      state.refresh();
      toast.success(remove ? "Actor removed from watchlist." : "Alert preference saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Change could not be saved.");
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="space-y-8">
      <DashboardPageHeader
        context="Research"
        title="Your Actor watchlist"
        description="Follow competitor demand, active-user rankings, pricing changes, and ratings."
        primaryAction={
          <Button asChild>
            <Link href="/dashboard/research">
              <Plus />
              Find Actors
            </Link>
          </Button>
        }
      />
      <WorkspaceState {...state} retry={state.refresh} />
      {state.data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">
              {state.data.length} of 100 watch slots used
            </p>
            <Button
              variant="outline"
              disabled={!state.data.length}
              onClick={() =>
                downloadCsv("actor-watchlist.csv", [
                  [
                    "Actor",
                    "Active users / 30d",
                    "Runs / 30d",
                    "Earnings low USD / 30d",
                    "Earnings central USD / 30d",
                    "Earnings high USD / 30d",
                    "Active-user rank",
                    "Alerts",
                    "Checked at",
                  ],
                  ...state.data!.map((watch) => [
                    `${watch.storeActor.username}/${watch.storeActor.actorName}`,
                    watch.storeActor.users30Days,
                    watch.storeActor.runs30Days,
                    ...(() => {
                      const a = watch.storeActor;
                      const e = estimateActorEarnings({
                        ...a,
                        pricingInfos: a.isPublic && !a.isDeprecated ? a.pricingInfos : null,
                      });
                      return [e.lowUsd, e.centralUsd, e.highUsd];
                    })(),
                    watch.baseline.rank,
                    watch.alertsEnabled,
                    watch.checkedAt,
                  ]),
                ])
              }
            >
              <Download />
              Export watchlist
            </Button>
          </div>
          {!state.data.length ? (
            <div className="border-border border p-8">
              <h2 className="text-lg font-semibold">Save your first competitor.</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Use Watch on a public Actor in Research. Changes appear in your notification inbox
                after the catalog refreshes.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <Link href="/dashboard/research">Browse Actors</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-border border-border divide-y border-y">
              {state.data.map((watch) => {
                const a = watch.storeActor;
                const earnings = estimateActorEarnings({
                  ...a,
                  pricingInfos: a.isPublic && !a.isDeprecated ? a.pricingInfos : null,
                });
                const profile = `/builders/${encodeURIComponent(a.username)}/actors/${encodeURIComponent(a.actorName)}`;
                const compare: PublicCompareItem = {
                  kind: "actor",
                  id: `${a.username}/${a.actorName}`,
                  username: a.username,
                  actorName: a.actorName,
                  title: a.title ?? a.actorName,
                  subtitle: `@${a.username}`,
                  href: profile,
                  imageUrl: a.pictureUrl,
                  window: 30,
                  metrics: {
                    earningsLow: earnings.lowUsd,
                    earningsCentral: earnings.centralUsd,
                    earningsHigh: earnings.highUsd,
                    earningsReason: earnings.reason ?? "Public scenarios before costs",
                    description: a.description,
                    activeUsers: a.users30Days,
                    runs30Days: a.runs30Days,
                    totalUsers: a.totalUsers,
                    rating: a.reviewRating,
                  },
                };
                return (
                  <article
                    key={watch.id}
                    className="grid gap-4 py-6 lg:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold">
                        <Link
                          href={profile}
                          className="break-words underline-offset-4 hover:underline"
                        >
                          {a.title ?? a.actorName}
                        </Link>
                      </h2>
                      <p className="text-muted-foreground mt-1 text-sm">
                        @{a.username}
                        {!a.isPublic || a.isDeprecated
                          ? " · No longer an active public listing"
                          : ""}
                      </p>
                      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
                        {[
                          ["Users / 30d", a.users30Days?.toLocaleString() ?? "Unavailable"],
                          ["Runs / 30d", a.runs30Days?.toLocaleString() ?? "Unavailable"],
                          [
                            "Active-user rank",
                            watch.baseline.rank ? `#${watch.baseline.rank}` : "Unavailable",
                          ],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-muted-foreground text-xs">{label}</dt>
                            <dd className="mt-1 font-medium tabular-nums">{value}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="mt-4 max-w-md">
                        <p className="text-muted-foreground mb-2 text-xs">
                          Est. monthly creator revenue
                        </p>
                        <EarningsBand value={earnings} compact />
                      </div>
                      <p className="text-muted-foreground mt-3 text-xs">
                        Checked {new Date(watch.checkedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-start gap-2">
                      <PublicCompareButton item={compare} />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending !== null}
                        onClick={() => change(watch)}
                        aria-pressed={watch.alertsEnabled}
                      >
                        {watch.alertsEnabled ? "Pause alerts" : "Enable alerts"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending !== null}
                        onClick={() => change(watch, true)}
                      >
                        Remove
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <p className="text-muted-foreground max-w-[75ch] text-xs leading-5">
            Alerts use catalog refreshes and appear in{" "}
            <Link href="/dashboard/notifications" className="underline underline-offset-4">
              Notifications
            </Link>
            . Demand changes require at least 10 users/runs and 10% change; rank, price, and rating
            changes are tracked separately. Product notification preferences also apply. Rank uses
            active users over 30 days and excludes deprecated listings.
          </p>
        </>
      )}
      <EarningsMethod />
    </div>
  );
}
