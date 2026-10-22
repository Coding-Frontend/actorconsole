import { Fragment } from "react";
import { PLAN_ACTOR_LIMITS, PLAN_MONTHLY_USER_LIMITS } from "@actorconsole/shared/plans";
import { Check } from "lucide-react";

const groups = [
  {
    name: "Workspace capacity",
    rows: [
      ["Actors per workspace", `Up to ${PLAN_ACTOR_LIMITS.FREE}`, "Unlimited"],
      ["Monthly users across your actors", `Up to ${PLAN_MONTHLY_USER_LIMITS.FREE}`, "Unlimited"],
    ],
  },
  {
    name: "Portfolio operations",
    rows: [
      ["Apify actor synchronization", "Included", "Included"],
      ["Workspace overview & activity", "Included", "Included"],
      ["Revenue, costs & usage analytics", "Included", "Included"],
      ["Pricing management & recommendations", "Included", "Included"],
      ["Publishing queues & status management", "Included", "Included"],
    ],
  },
  {
    name: "Research & connected tools",
    rows: [
      ["Store search & actor comparison", "Included", "Included"],
      ["Keyword research & watchlists", "Included", "Included"],
      ["AI-assisted listing copy", "Included", "Included"],
      ["Authenticated MCP access", "Included", "Included"],
      ["Support & documentation", "Included", "Included"],
    ],
  },
];

export function PlanComparison() {
  return (
    <section aria-labelledby="plan-comparison-heading">
      <div className="mb-6">
        <h2 id="plan-comparison-heading" className="font-display-tight text-2xl sm:text-3xl">
          Compare Free and Pro
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          The same workflows. Choose the capacity your workspace needs.
        </p>
      </div>
      <div className="border-border bg-card overflow-hidden rounded-md border">
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">Workspace plan features and limits</caption>
          <thead>
            <tr className="border-border border-b">
              <th scope="col" className="w-[52%] px-4 py-5 font-medium sm:px-6">
                Features & limits
              </th>
              <th scope="col" className="px-2 py-5 text-center text-base font-semibold sm:px-4">
                Free
              </th>
              <th
                scope="col"
                className="plan-pro-wash px-2 py-5 text-center text-base font-semibold sm:px-4"
              >
                Pro
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.name}>
                <tr className="border-border bg-muted/50 border-y">
                  <th
                    scope="rowgroup"
                    colSpan={3}
                    className="px-4 py-3 text-xs font-semibold sm:px-6"
                  >
                    {group.name}
                  </th>
                </tr>
                {group.rows.map(([label, free, pro]) => (
                  <tr key={label} className="border-border border-b last:border-0">
                    <th scope="row" className="px-4 py-4 font-normal leading-5 sm:px-6">
                      {label}
                    </th>
                    {[free, pro].map((value, index) => (
                      <td
                        key={index}
                        className={`px-2 py-4 text-center sm:px-4 ${index === 1 ? "plan-pro-wash" : ""}`}
                      >
                        {value === "Included" ? (
                          <span className="inline-flex items-center justify-center gap-2">
                            <Check aria-hidden="true" className="text-success size-4 shrink-0" />
                            <span className="sr-only sm:not-sr-only">Included</span>
                          </span>
                        ) : (
                          <span className={index === 1 ? "font-semibold" : ""}>{value}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground mt-4 max-w-3xl text-xs leading-5">
        Monthly users are summed across your actors over the past 30 days; a person can count in
        more than one actor. Free requires staying within both limits. Above either limit, Pro is
        required for workspace operations. Keyword search, MCP connection, support, documentation,
        billing, and connection setup remain accessible. MCP operations follow the same workspace
        limits.
      </p>
    </section>
  );
}
