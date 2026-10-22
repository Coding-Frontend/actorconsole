import { workspaceApifyRequiredPage } from "@/components/dashboard/workspace-apify-required-page";
import Link from "next/link";
import { notFound } from "next/navigation";
import { authenticatedServerFetch } from "@/lib/server-api";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Section = "overview" | "logs" | "dataset" | "key-value-store";

interface RunData {
  storageUnavailable?: boolean;
  actor: { id: string; title: string | null; username: string; actorName: string };
  run: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt?: string;
    buildId?: string;
    exitCode?: number;
    origin?: string;
    usageTotalUsd?: number;
    defaultDatasetId?: string;
    defaultKeyValueStoreId?: string;
    stats?: Record<string, number>;
  };
  log?: string;
  truncated?: boolean;
  dataset?: { items: unknown[]; total: number; offset: number; limit: number };
  keyValueStore?: {
    items: Array<{ key: string; size: number }>;
    isTruncated: boolean;
    nextExclusiveStartKey?: string;
    record: { key: string; contentType: string | null; value: unknown; tooLarge: boolean } | null;
  };
}

function timestamp(value?: string) {
  return value ? new Date(value).toLocaleString() : "—";
}

function pretty(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-border border-b py-3 last:border-0 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs sm:mt-0">{value}</dd>
    </div>
  );
}

export default async function ActorRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; runId: string }>;
  searchParams: Promise<{ section?: string; offset?: string; cursor?: string; key?: string }>;
}) {
  const setup = await workspaceApifyRequiredPage("Run details");
  if (setup) return setup;
  const { id, runId } = await params;
  const query = await searchParams;
  let section: Section =
    query.section === "logs" || query.section === "dataset" || query.section === "key-value-store"
      ? query.section
      : "overview";
  const base = `/dashboard/actors/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`;
  const apiQuery = new URLSearchParams({ section });
  if (section === "dataset" && query.offset) apiQuery.set("offset", query.offset);
  if (section === "key-value-store" && query.cursor) apiQuery.set("cursor", query.cursor);
  if (section === "key-value-store" && query.key) apiQuery.set("key", query.key);
  const response = await authenticatedServerFetch(
    `/actors/by-id/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}?${apiQuery}`,
  );
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Could not load this Actor run");
  const { data } = (await response.json()) as { data: RunData };
  if (data.storageUnavailable) section = "overview";
  const { actor, run } = data;
  const actorName = actor.title || `${actor.username}/${actor.actorName}`;
  const sections: Array<{ id: Section; label: string }> = data.storageUnavailable ? [
    { id: "overview", label: "Overview" },
  ] : [
    { id: "overview", label: "Overview" },
    { id: "logs", label: "Logs" },
    { id: "dataset", label: "Dataset" },
    { id: "key-value-store", label: "Key-value store" },
  ];

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context={`Actors / ${actor.username}/${actor.actorName} / Run`}
        title="Run details"
        description={run.id}
        breadcrumbs={[
          { label: "Workspace", href: "/dashboard" },
          { label: "Actors", href: "/dashboard/actors" },
          { label: actorName, href: `/dashboard/actors/${encodeURIComponent(id)}?tab=analytics` },
          { label: "Run" },
        ]}
        status={
          <Badge variant={run.status === "SUCCEEDED" ? "default" : "outline"}>{run.status}</Badge>
        }
        primaryAction={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/actors/${encodeURIComponent(id)}?tab=analytics`}>
              Back to runs
            </Link>
          </Button>
        }
      />

      {data.storageUnavailable && (
        <div role="status" className="border-border bg-muted rounded-sm border p-4 text-sm">
          This run is no longer available on Apify. Its saved summary is shown below.
          Logs, datasets, and key-value storage are unavailable.
        </div>
      )}

      <nav aria-label="Run details" className="border-border flex flex-wrap gap-1 border-b pb-2">
        {sections.map((item) => (
          <Link
            key={item.id}
            href={`${base}?section=${item.id}`}
            aria-current={section === item.id ? "page" : undefined}
            className={`rounded-sm px-3 py-2 text-sm ${section === item.id ? "bg-signal-orange text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {section === "overview" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Run overview</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Detail label="Run ID" value={run.id} />
              <Detail label="Status" value={run.status} />
              <Detail label="Started" value={timestamp(run.startedAt)} />
              <Detail label="Finished" value={timestamp(run.finishedAt)} />
              <Detail label="Build ID" value={run.buildId ?? "—"} />
              <Detail label="Exit code" value={run.exitCode ?? "—"} />
              <Detail label="Origin" value={run.origin ?? "—"} />
              <Detail
                label="Usage cost"
                value={run.usageTotalUsd == null ? "—" : `$${run.usageTotalUsd.toFixed(4)}`}
              />
              <Detail label="Dataset ID" value={run.defaultDatasetId ?? "—"} />
              <Detail label="Key-value store ID" value={run.defaultKeyValueStoreId ?? "—"} />
            </dl>
            {run.stats && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-semibold">Resource statistics</h3>
                <dl>
                  {Object.entries(run.stats).map(([key, value]) => (
                    <Detail key={key} label={key} value={value} />
                  ))}
                </dl>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {section === "logs" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Run log</CardTitle>
          </CardHeader>
          <CardContent>
            {data.truncated && (
              <p className="text-muted-foreground mb-3 text-xs">
                Showing the latest 200,000 characters.
              </p>
            )}
            {data.log ? (
              <pre className="bg-muted max-h-[70vh] overflow-auto whitespace-pre-wrap break-all rounded-sm p-4 font-mono text-xs">
                {data.log}
              </pre>
            ) : (
              <p className="text-muted-foreground text-sm">No log is available for this run.</p>
            )}
          </CardContent>
        </Card>
      )}

      {section === "dataset" && data.dataset && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Dataset · {data.dataset.total.toLocaleString()} items
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.dataset.items.length ? (
              data.dataset.items.map((item, index) => (
                <div key={data.dataset!.offset + index} className="border-border rounded-sm border">
                  <p className="border-border border-b px-3 py-2 font-mono text-xs">
                    Item {data.dataset!.offset + index + 1}
                  </p>
                  <pre className="max-h-80 overflow-auto p-3 font-mono text-xs">{pretty(item)}</pre>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">This run has no dataset items.</p>
            )}
            <div className="flex gap-2">
              {data.dataset.offset > 0 && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`${base}?section=dataset&offset=${Math.max(0, data.dataset.offset - data.dataset.limit)}`}
                  >
                    Previous
                  </Link>
                </Button>
              )}
              {data.dataset.offset + data.dataset.items.length < data.dataset.total && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`${base}?section=dataset&offset=${data.dataset.offset + data.dataset.limit}`}
                  >
                    Next
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {section === "key-value-store" && data.keyValueStore && (
        <div className="grid gap-4 lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Records</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {data.keyValueStore.items.length ? (
                data.keyValueStore.items.map((item) => (
                  <Link
                    key={item.key}
                    href={`${base}?section=key-value-store&key=${encodeURIComponent(item.key)}`}
                    className="hover:bg-muted block rounded-sm px-2 py-2 text-xs"
                  >
                    <span className="block break-all font-mono">{item.key}</span>
                    <span className="text-muted-foreground">
                      {item.size.toLocaleString()} bytes
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">No records are available.</p>
              )}
              {data.keyValueStore.isTruncated && data.keyValueStore.nextExclusiveStartKey && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`${base}?section=key-value-store&cursor=${encodeURIComponent(data.keyValueStore.nextExclusiveStartKey)}`}
                  >
                    More records
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Record preview</CardTitle>
            </CardHeader>
            <CardContent>
              {data.keyValueStore.record ? (
                <div className="space-y-3">
                  <p className="break-all font-mono text-sm">{data.keyValueStore.record.key}</p>
                  {data.keyValueStore.record.contentType && (
                    <p className="text-muted-foreground text-xs">
                      {data.keyValueStore.record.contentType}
                    </p>
                  )}
                  {data.keyValueStore.record.tooLarge ? (
                    <p className="text-muted-foreground text-sm">
                      This record is too large to preview here (over 256 KB).
                    </p>
                  ) : data.keyValueStore.record.value == null ? (
                    <p className="text-muted-foreground text-sm">
                      Preview is available for text and JSON records.
                    </p>
                  ) : (
                    <pre className="bg-muted max-h-[65vh] overflow-auto rounded-sm p-3 font-mono text-xs">
                      {pretty(data.keyValueStore.record.value)}
                    </pre>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Select a record to view its contents.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
