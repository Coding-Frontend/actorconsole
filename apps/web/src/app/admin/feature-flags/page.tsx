import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { api } from "@/lib/admin/server-api";
import { FeatureFlagRow } from "@/components/admin/feature-flag-row";
import { AdminApiError } from "@/components/admin/admin-pagination";

const DEFAULT_FLAGS = [
  {
    key: "apify_chrome_extension",
    description: "Allow the Chrome extension to connect Apify Console sessions to workspaces",
    defaultEnabled: true,
  },
  { key: "pro_pricing_experiments", description: "Enable pay-per-event market recommendations" },
  { key: "mcp_self_host", description: "Allow users to run the MCP server from npm" },
  {
    key: "kill_switch_ai_rewrite",
    description: "Allow AI rewrite features; turn this off during incidents",
  },
];

export default async function FeatureFlagsPage() {
  const res = await api<any>("/admin/feature-flags");
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Feature flags"
          description="Toggle platform features without redeploying."
        />
        <AdminApiError message={res.error.message ?? "Failed to load feature flags"} />
      </div>
    );
  }
  const flags: any[] = res.data;
  const flagByKey = Object.fromEntries(flags.map((f) => [f.key, f]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feature flags"
        description="Toggle platform features without redeploying."
      />

      <Card>
        <ul className="divide-border/40 divide-y">
          {DEFAULT_FLAGS.map((def) => (
            <li key={def.key} className="p-4">
              <FeatureFlagRow
                flagKey={def.key}
                description={def.description}
                initial={
                  flagByKey[def.key]
                    ? {
                        enabled: flagByKey[def.key].enabled,
                        rolloutPct: flagByKey[def.key].rolloutPct,
                      }
                    : { enabled: def.defaultEnabled ?? true, rolloutPct: 100 }
                }
              />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
