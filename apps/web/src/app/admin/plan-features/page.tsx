import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { PlanMarketingFeatureEditor } from "@/components/admin/plan-marketing-feature-editor";
import { api } from "@/lib/admin/server-api";
import { AdminApiError } from "@/components/admin/admin-pagination";

type Plan = "FREE" | "PRO";
type PlanMarketingFeature = { plan: Plan; label: string; enabled: boolean };

const plans: Array<{ plan: Plan; title: string; description: string }> = [
  {
    plan: "FREE",
    title: "Free",
    description: "The entry plan shown on the public pricing surfaces.",
  },
  { plan: "PRO", title: "Pro", description: "The full operating surface for active builders." },
];

export default async function PlanFeaturesPage() {
  const result = await api<PlanMarketingFeature[]>("/admin/plan-features");
  if (!result.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Plan marketing copy" description="Manage customer-facing pricing features." />
        <AdminApiError message={result.error.message ?? "Failed to load plan features"} />
      </div>
    );
  }
  const rows = result.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan marketing copy"
        description="Manage the customer-facing pricing features from the same database-backed source used by the public pricing cards."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map(({ plan, title, description }) => {
          const labels = rows
            .filter((row) => row.plan === plan && row.enabled)
            .map((row) => row.label);
          return (
            <Card key={plan}>
              <CardContent className="space-y-4 p-5">
                <div>
                  <p className="type-kicker text-signal-orange">{plan}</p>
                  <h2 className="font-display-tight mt-1 text-2xl">{title}</h2>
                  <p className="text-muted-foreground mt-2 text-sm leading-5">{description}</p>
                </div>
                <PlanMarketingFeatureEditor plan={plan} initialLabels={labels} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
