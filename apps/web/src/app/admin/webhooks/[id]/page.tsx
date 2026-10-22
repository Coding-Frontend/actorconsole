import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { AdminDetailError } from "@/components/admin/admin-pagination";
import { api } from "@/lib/admin/server-api";
import { ArrowLeft } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface WebhookDelivery {
  id: string;
  source: string;
  eventType: string;
  externalId: string | null;
  payload: Record<string, unknown>;
  status: string;
  statusCode: number | null;
  responseMs: number | null;
  error: string | null;
  signatureOk: boolean | null;
  createdAt: string;
}

export default async function WebhookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await api<WebhookDelivery>(`/admin/webhooks/${id}`);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <AdminDetailError
        title="Webhook delivery unavailable"
        message={res.error.message}
        backHref="/admin/webhooks"
        backLabel="Back to webhooks"
      />
    );
  }
  const w = res.data;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/webhooks">
            <ArrowLeft className="mr-1 h-4 w-4" />
            All webhooks
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Webhook delivery"
        description={`From ${w.source} · ${formatDate(w.createdAt, { withTime: true })}`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Source" value={<Badge variant="outline">{w.source}</Badge>} />
            <Row label="Event" value={<span className="font-mono">{w.eventType}</span>} />
            <Row
              label="Status"
              value={
                <Badge
                  variant={
                    w.status === "processed"
                      ? "success"
                      : w.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {w.status}
                </Badge>
              }
            />
            {w.statusCode && <Row label="Status code" value={w.statusCode} />}
            {w.responseMs && <Row label="Duration" value={`${w.responseMs}ms`} />}
            <Row
              label="Signature valid"
              value={
                w.signatureOk === null ? (
                  "—"
                ) : w.signatureOk ? (
                  <Badge variant="success">Yes</Badge>
                ) : (
                  <Badge variant="destructive">No</Badge>
                )
              }
            />
            {w.externalId && (
              <Row
                label="External ID"
                value={<span className="font-mono text-xs">{w.externalId}</span>}
              />
            )}
          </CardContent>
        </Card>

        {w.error && (
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive text-base">Error</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted whitespace-pre-wrap rounded-lg p-3 text-xs">{w.error}</pre>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payload</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted max-h-[500px] overflow-auto whitespace-pre-wrap rounded-lg p-4 font-mono text-xs leading-relaxed">
            {JSON.stringify(w.payload, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-border/40 flex items-center justify-between border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
