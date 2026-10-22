import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { AdminDetailError } from "@/components/admin/admin-pagination";
import { api } from "@/lib/admin/server-api";
import { formatDate, relativeTime } from "@/lib/utils";
import { ArrowLeft, Activity } from "lucide-react";
import { IncidentUpdateForm } from "@/components/admin/incident-update-form";

interface IncidentDetail {
  id: string;
  title: string;
  status: string;
  severity: string;
  message: string;
  updates: Array<{ status: string; message: string; timestamp: string }> | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default async function AdminIncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await api<IncidentDetail>(`/admin/incidents/${id}`);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <AdminDetailError
        title="Incident unavailable"
        message={res.error.message}
        backHref="/admin/incidents"
        backLabel="Back to incidents"
      />
    );
  }

  const inc = res.data;
  const statusColors: Record<string, string> = {
    resolved: "bg-signal-green/10 text-signal-green",
    monitoring: "bg-signal-blue/10 text-signal-blue",
    identified: "bg-signal-orange/10 text-signal-orange",
    investigating: "bg-destructive/10 text-destructive",
  };
  const severityColors: Record<string, string> = {
    critical: "destructive",
    major: "warning",
    minor: "secondary",
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/incidents">
          <ArrowLeft className="h-4 w-4" /> All incidents
        </Link>
      </Button>

      <PageHeader title={inc.title} description={relativeTime(inc.createdAt)} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row
              label="Status"
              value={
                <span
                  className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${statusColors[inc.status] ?? ""}`}
                >
                  {inc.status}
                </span>
              }
            />
            <Row
              label="Severity"
              value={
                <Badge variant={(severityColors[inc.severity] ?? "secondary") as any}>
                  {inc.severity}
                </Badge>
              }
            />
            <Row label="Created" value={formatDate(inc.createdAt, { withTime: true })} />
            <Row label="Updated" value={formatDate(inc.updatedAt, { withTime: true })} />
            {inc.resolvedAt && (
              <Row label="Resolved" value={formatDate(inc.resolvedAt, { withTime: true })} />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Initial report</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{inc.message}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Publish an update</CardTitle></CardHeader>
        <CardContent><IncidentUpdateForm id={inc.id} currentStatus={inc.status} /></CardContent>
      </Card>

      {/* Timeline */}
      {inc.updates && inc.updates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Timeline ({inc.updates.length} updates)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-6 pl-6">
              <div className="bg-border absolute bottom-1 left-2.5 top-1 w-px" />
              {inc.updates.map((u, i) => (
                <div key={i} className="relative">
                  <div className="bg-signal-orange ring-background absolute -left-4 mt-1.5 h-2 w-2 rounded-full ring-2" />
                  <div className="space-y-1">
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColors[u.status] ?? ""}`}
                      >
                        {u.status}
                      </span>
                      <span>{formatDate(u.timestamp, { withTime: true })}</span>
                    </div>
                    <p className="text-sm">{u.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
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
