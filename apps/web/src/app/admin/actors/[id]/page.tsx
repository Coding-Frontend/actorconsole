import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader } from "@/components/admin/page-header";
import { AdminDetailError } from "@/components/admin/admin-pagination";
import { api } from "@/lib/admin/server-api";
import { ArrowLeft, Bot, Calendar, BarChart3 } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";
import { ActorWebsiteAssignment } from "@/components/admin/actor-website-assignment";

interface ActorDetail {
  id: string;
  apifyActorId: string;
  username: string;
  actorName: string;
  title: string | null;
  description: string | null;
  currentCopy: Record<string, unknown> | null;
  currentImageUrl: string | null;
  websiteClassificationError: string | null;
  effectivePictureUrl: string | null;
  pictureSource: "actor" | "website" | "fallback";
  website: {
    id: string;
    name: string;
    slug: string;
    canonicalDomain: string | null;
    currentLogo: { id: string } | null;
  } | null;
  currentPricing: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string; name: string | null };
  businessProfile: { id: string; name: string; plan: string };
  snapshots: Array<{
    id: string;
    capturedAt: string;
    runs30d: number | null;
    usersTotal: number | null;
    monthlyUsers: number | null;
    rating: number | null;
    pricing: Record<string, unknown> | null;
    searchRank: number | null;
  }>;
  copyVariants: Array<{
    id: string;
    field: string;
    value: string;
    generatedBy: string;
    isActive: boolean;
    createdAt: string;
  }>;
  pricingHistory: Array<{
    id: string;
    model: string;
    amount: string | null;
    currency: string | null;
    payload: Record<string, unknown> | null;
    changedBy: string;
    reason: string | null;
    changedAt: string;
  }>;
  bulkPublishItems: Array<{
    scheduleId: string;
    status: string;
    createdAt: string;
    schedule: { id: string; name: string; enabled: boolean };
  }>;
  usageDaily: Array<{
    id: string;
    date: string;
    usageCostUsd: string;
    runs: number;
  }>;
}

export default async function AdminActorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await api<ActorDetail>(`/admin/actors/${id}`);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <AdminDetailError
        title="Actor unavailable"
        message={res.error.message}
        backHref="/admin/actors"
        backLabel="Back to actors"
      />
    );
  }
  const a = res.data;
  const websitesResponse = await api<{ items: Array<{ id: string; name: string }> }>(
    "/admin/website-logos?limit=200",
  );
  const websiteOptions = websitesResponse.ok ? websitesResponse.data.items : [];

  const totalUsageCost = a.usageDaily.reduce((s, r) => s + Number(r.usageCostUsd), 0);
  const totalRuns = a.usageDaily.reduce((s, r) => s + r.runs, 0);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/actors">
          <ArrowLeft className="h-4 w-4" /> Back to actors
        </Link>
      </Button>

      <PageHeader title={`${a.username}/${a.actorName}`} description={a.title ?? "No title"} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row
              label="Owner"
              value={
                <Link
                  href={`/admin/users/${a.user.id}`}
                  className="text-signal-orange font-medium hover:underline"
                >
                  {a.user.name ?? a.user.email}
                </Link>
              }
            />
            <Row label="Workspace" value={a.businessProfile.name} />
            <Row label="Plan" value={<Badge variant="outline">{a.businessProfile.plan}</Badge>} />
            <Row label="Apify ID" value={<code className="text-xs">{a.apifyActorId}</code>} />
            <Row
              label="Website"
              value={
                a.website ? (
                  <Link
                    href={`/admin/website-logos?q=${encodeURIComponent(a.website.name)}`}
                    className="text-signal-blue hover:underline"
                  >
                    {a.website.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Unclassified</span>
                )
              }
            />
            <Row label="Image source" value={<Badge variant="outline">{a.pictureSource}</Badge>} />
            {a.websiteClassificationError ? (
              <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-xs">
                Classification failed: {a.websiteClassificationError}
              </div>
            ) : null}
            <ActorWebsiteAssignment
              actorId={a.id}
              currentWebsiteId={a.website?.id ?? null}
              websites={websiteOptions}
            />
            <Row label="Created" value={formatDate(a.createdAt)} />
            <Row label="Updated" value={formatDate(a.updatedAt)} />
            {a.currentPricing && (
              <Row
                label="Pricing"
                value={<code className="text-xs">{JSON.stringify(a.currentPricing)}</code>}
              />
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <StatBox label="Publishing queues" value={a.bulkPublishItems.length} icon={Calendar} />
            <StatBox
              label="Usage cost (30d)"
              value={`$${totalUsageCost.toFixed(2)}`}
              icon={BarChart3}
            />
            <StatBox label="Runs (30d)" value={formatNumber(totalRuns)} icon={Bot} />
            <StatBox label="Copy variants" value={a.copyVariants.length} icon={Bot} />
          </CardContent>
        </Card>

        {/* Current details */}
        <Card>
          <CardHeader>
            <CardTitle>Current State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {a.effectivePictureUrl && (
              <div>
                <p className="text-muted-foreground mb-1 text-xs">Thumbnail</p>
                <Avatar className="bg-muted/60 h-20 w-20 rounded-lg border">
                  <AvatarImage
                    src={a.effectivePictureUrl}
                    alt={`${a.title ?? a.actorName} thumbnail`}
                    className="rounded-lg object-cover"
                  />
                  <AvatarFallback className="rounded-lg text-sm">
                    {(a.title ?? a.actorName)
                      .split(/\s+|[-_]+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase())
                      .join("") || "A"}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}
            {a.description && (
              <div>
                <p className="text-muted-foreground mb-1 text-xs">Description</p>
                <p className="line-clamp-3 text-xs">{a.description}</p>
              </div>
            )}
            {a.currentCopy && (
              <div>
                <p className="text-muted-foreground mb-1 text-xs">Current Copy</p>
                <pre className="bg-muted max-h-32 overflow-auto rounded p-2 text-xs">
                  {JSON.stringify(a.currentCopy, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Snapshots */}
      {a.snapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Snapshots ({a.snapshots.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-xs">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Runs (30d)</th>
                    <th className="pb-2 font-medium">Users</th>
                    <th className="pb-2 font-medium">Monthly Users</th>
                    <th className="pb-2 font-medium">Rating</th>
                    <th className="pb-2 font-medium">Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {a.snapshots.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 text-xs">{formatDate(s.capturedAt)}</td>
                      <td className="py-2">{s.runs30d ?? "—"}</td>
                      <td className="py-2">{s.usersTotal ?? "—"}</td>
                      <td className="py-2">{s.monthlyUsers ?? "—"}</td>
                      <td className="py-2">{s.rating ? `${s.rating.toFixed(1)}★` : "—"}</td>
                      <td className="py-2">{s.searchRank ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Copy Variants */}
      {a.copyVariants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Copy Variants ({a.copyVariants.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {a.copyVariants.map((v) => (
              <div key={v.id} className="rounded-lg border p-3 text-sm">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {v.field}
                  </Badge>
                  <Badge variant={v.isActive ? "success" : "secondary"} className="text-[10px]">
                    {v.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <span className="text-muted-foreground text-xs">by {v.generatedBy}</span>
                </div>
                <p className="text-muted-foreground line-clamp-3 text-xs">{v.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6">
        <RelatedRecords
          title={`Publishing queues (${a.bulkPublishItems.length})`}
          empty="Not part of a publishing queue."
          records={a.bulkPublishItems.map((item) => ({
            id: item.scheduleId,
            title: item.schedule.name,
            meta: `${item.status} · ${item.schedule.enabled ? "Enabled" : "Paused"}`,
            date: item.createdAt,
          }))}
        />
      </div>

      {a.pricingHistory.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pricing history ({a.pricingHistory.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {a.pricingHistory.map((entry) => (
              <div
                key={entry.id}
                className="border-border grid gap-2 rounded-md border p-3 text-sm md:grid-cols-[180px_minmax(0,1fr)]"
              >
                <div>
                  <p className="font-medium">{formatDate(entry.changedAt, { withTime: true })}</p>
                  <p className="text-muted-foreground text-xs">
                    {entry.model}
                    {entry.amount ? ` · ${entry.currency ?? "USD"} ${entry.amount}` : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {entry.reason ?? "Pricing sync"} · {entry.changedBy}
                  </p>
                </div>
                <pre className="bg-muted max-h-40 overflow-auto rounded-sm p-3 text-xs">
                  {JSON.stringify(entry.payload ?? {}, null, 2)}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

type RelatedRecord = { id: string; title: string; meta: string; date: string };

function RelatedRecords({
  title,
  empty,
  records,
  href,
}: {
  title: string;
  empty: string;
  records: RelatedRecord[];
  href?: (record: RelatedRecord) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {records.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          records.map((record) => (
            <div
              key={record.id}
              className="border-border flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <div className="min-w-0">
                {href ? (
                  <Link href={href(record)} className="font-medium capitalize hover:underline">
                    {record.title}
                  </Link>
                ) : (
                  <p className="font-medium capitalize">{record.title}</p>
                )}
                <p className="text-muted-foreground truncate text-xs">{record.meta}</p>
              </div>
              <span className="text-muted-foreground shrink-0 text-xs">
                {formatDate(record.date)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-border/40 flex items-center justify-between border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function StatBox({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: typeof Bot;
}) {
  return (
    <div className="border-border/60 bg-muted/30 rounded-lg border p-3">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="text-muted-foreground h-3.5 w-3.5" />
        <p className="text-muted-foreground text-xs">{label}</p>
      </div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
