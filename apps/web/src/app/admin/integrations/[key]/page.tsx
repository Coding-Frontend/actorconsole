import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { api } from "@/lib/admin/server-api";
import { getIntegrationDef } from "@actorconsole/shared";
import { formatDate, relativeTime } from "@/lib/utils";
import { IntegrationEditor } from "@/components/admin/integration-editor";
import { AdminDetailError } from "@/components/admin/admin-pagination";

export default async function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const def = getIntegrationDef(key);
  if (!def) notFound();
  if (def.category === "payment") redirect("/admin/payment-gateways");

  const res = await api<any>(`/admin/integrations/${key}`);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <AdminDetailError
        title={`${def.label} unavailable`}
        message={res.error.message}
        backHref="/admin/integrations"
        backLabel="Back to integrations"
      />
    );
  }
  const integration = res.data;
  const providedByCookies =
    key === "apify_ui_token" && integration.activeConsoleCredential === "apify_cookies";

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/integrations">
          <ArrowLeft className="h-4 w-4" />
          Back to integrations
        </Link>
      </Button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{def.label}</h1>
          <p className="text-muted-foreground text-sm">{def.description}</p>
          <code className="bg-muted mt-2 inline-block rounded px-2 py-0.5 text-xs">{def.key}</code>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{def.category}</Badge>
          {def.isSecret ? <Badge variant="warning">Secret</Badge> : null}
          {integration.isActive ? <Badge variant="success">Active</Badge> : null}
          {providedByCookies ? <Badge variant="success">Provided by cookies</Badge> : null}
          {!providedByCookies && integration.isConfigured && integration.isActive === false ? (
            <Badge variant="secondary">Fallback not active</Badge>
          ) : null}
          {providedByCookies ? null : integration.isConfigured ? (
            <Badge variant="success">Configured</Badge>
          ) : (
            <Badge variant="secondary">Not configured</Badge>
          )}
        </div>
      </div>

      {providedByCookies ? (
        <Card>
          <CardContent className="p-4 text-sm sm:p-5">
            Platform Apify Cookies are active. ActorConsole automatically obtains the Console UI
            token from them, so no manual UI key is needed.
          </CardContent>
        </Card>
      ) : null}

      {integration.testStatus === "error" && !providedByCookies ? (
        <Card className="border-destructive/35 bg-destructive/[0.045]">
          <CardContent className="flex items-start gap-3 p-4 sm:p-5">
            <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="text-sm font-medium">
                {integration.activeConsoleCredential
                  ? "This fallback credential is not active"
                  : "Credential is not working"}
              </p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                {integration.testMessage ?? "Update this credential and test the connection again."}
                {integration.activeConsoleCredential
                  ? " A healthy alternative is currently selected for Console requests."
                  : null}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <IntegrationEditor
            defKey={def.key}
            initialValue={integration.value ?? def.defaultValue ?? ""}
            isSecret={def.isSecret ?? false}
            pattern={def.pattern ?? undefined}
            options={def.options}
            testable={def.testable ?? false}
            isConfigured={integration.isConfigured ?? false}
          />
        </CardContent>
      </Card>

      {integration.updatedAt ? (
        <p className="text-muted-foreground text-xs">
          Last updated {relativeTime(integration.updatedAt)} ·{" "}
          {formatDate(integration.updatedAt, { withTime: true })}
        </p>
      ) : null}
      {integration.lastTestedAt ? (
        <p className="text-muted-foreground text-xs">
          Last live test {relativeTime(integration.lastTestedAt)} ·{" "}
          {formatDate(integration.lastTestedAt, { withTime: true })}
        </p>
      ) : null}
    </div>
  );
}
