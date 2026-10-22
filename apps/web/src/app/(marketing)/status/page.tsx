import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { SERVER_API_BASE_URL } from "@/lib/api-base";
import { formatDate, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Container, Section } from "@/components/ui/layout";
import { PageHero } from "@/components/marketing/page-hero";

export const metadata: Metadata = {
  title: "Status — ActorConsole",
  description: "Current system status and incident history for ActorConsole.",
};

const statusColors: Record<string, string> = {
  resolved: "bg-signal-green/10 text-signal-green",
  monitoring: "bg-signal-blue/10 text-signal-blue",
  identified: "bg-signal-orange/10 text-signal-orange",
  investigating: "bg-destructive/10 text-destructive",
};

interface StatusIncident {
  id: string;
  title: string;
  status: string;
  severity: string;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
}

interface StatusData {
  status: string;
  activeIncidents: number;
  incidents?: { active?: StatusIncident[]; recent?: StatusIncident[] };
  services?: Array<{ name: string; status: string }>;
}

async function getStatus(): Promise<StatusData | null> {
  try {
    const response = await fetch(`${SERVER_API_BASE_URL}/status`, { next: { revalidate: 30 } });
    if (!response.ok) return null;
    const body = (await response.json()) as { ok: boolean; data?: StatusData };
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

export default async function StatusPage() {
  const status = await getStatus();
  const activeIncidents = status?.incidents?.active ?? [];
  const resolvedIncidents = status?.incidents?.recent ?? [];

  return (
    <main className="marketing-page flex-1">
      <PageHero
        tone="ink"
        kicker="System status"
        title={<>A clear view of the operating surface.</>}
        description="Live service checks with published incident history."
        aside={
          <div className="border border-white/15 bg-white/[0.045] p-5 sm:p-6">
            {status?.status === "operational" ? (
              <CheckCircle2 className="text-signal-green h-5 w-5" />
            ) : (
              <AlertTriangle className="text-signal-orange h-5 w-5" />
            )}
            <p className="font-display-tight mt-5 text-3xl text-white">
              {!status
                ? "Unavailable"
                : status.status === "operational"
                  ? "Operational"
                  : "Action needed"}
            </p>
            <p className="mt-3 text-sm leading-6 text-white/60">
              {!status
                ? "Live service data is unavailable for this request."
                : status.status === "operational"
                  ? "No active incidents are affecting the reported services."
                  : `${status.activeIncidents} active incident(s) currently reported.`}
            </p>
          </div>
        }
      />

      <Section variant="muted" className="pt-12">
        <Container className="max-w-3xl space-y-10">
          {!status && (
            <div className="py-16 text-center">
              <AlertTriangle className="text-signal-orange/70 mx-auto h-12 w-12" />
              <p className="mt-4 text-lg font-medium">Live status is unavailable</p>
              <p className="text-muted-foreground text-sm">
                Live service data is unavailable. Refresh this page to try again.
              </p>
            </div>
          )}

          {activeIncidents.length > 0 && (
            <IncidentList title="Active incidents" incidents={activeIncidents} active />
          )}

          {resolvedIncidents.length > 0 && (
            <IncidentList title="Past incidents" incidents={resolvedIncidents} />
          )}

          {status && activeIncidents.length === 0 && resolvedIncidents.length === 0 && (
            <div className="py-16 text-center">
              <CheckCircle2 className="text-signal-green/70 mx-auto h-12 w-12" />
              <p className="mt-4 text-lg font-medium">No incidents reported</p>
              <p className="text-muted-foreground text-sm">
                All reported services are operating normally.
              </p>
            </div>
          )}
        </Container>
      </Section>

      {status && (
        <Section variant="default" className="pb-20 pt-0">
          <Container className="max-w-3xl">
            <div className="blueprint-frame bg-card p-5 sm:p-6">
              <h2 className="text-foreground mb-4 text-sm font-semibold">Live service checks</h2>
              <div className="blueprint-bento">
                {(status.services ?? []).map((service) => (
                  <div
                    key={service.name}
                    className="blueprint-cell bg-muted/30 flex items-center justify-between border-0 px-4 py-3"
                  >
                    <span className="text-foreground text-sm font-medium">{service.name}</span>
                    <span className="text-signal-green flex items-center gap-2 text-xs font-medium capitalize">
                      <span className="bg-signal-green h-2 w-2 rounded-full" />
                      {service.status}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-slate mt-4 text-center text-xs">
                Checks reflect this request. Historical uptime is not estimated.
              </p>
            </div>
          </Container>
        </Section>
      )}
    </main>
  );
}

function IncidentList({
  title,
  incidents,
  active = false,
}: {
  title: string;
  incidents: StatusIncident[];
  active?: boolean;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {incidents.map((incident) => (
        <Card key={incident.id} className={active ? "border-signal-orange/50" : "border-border/60"}>
          <CardHeader>
            <div className="flex items-start gap-3">
              {active ? (
                <AlertTriangle className="text-signal-orange mt-0.5 h-5 w-5" />
              ) : (
                <CheckCircle2 className="text-signal-green mt-0.5 h-5 w-5" />
              )}
              <div>
                <CardTitle className="text-base">{incident.title}</CardTitle>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge variant="outline" className={statusColors[incident.status] ?? ""}>
                    {incident.status}
                  </Badge>
                  <Badge variant="outline">{incident.severity}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {active
                      ? relativeTime(incident.createdAt)
                      : `${formatDate(incident.createdAt)}${
                          incident.resolvedAt
                            ? ` · Resolved ${relativeTime(incident.resolvedAt)}`
                            : ""
                        }`}
                  </span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{incident.message}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
