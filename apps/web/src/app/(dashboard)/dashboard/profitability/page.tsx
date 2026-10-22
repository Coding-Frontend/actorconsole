import { Suspense } from "react";
import { Profitability } from "@/components/intelligence/profitability";
import { workspaceApifyRequiredPage } from "@/components/dashboard/workspace-apify-required-page";
export default async function Page() {
  const setup = await workspaceApifyRequiredPage("Profitability");
  if (setup) return setup;
  return (
    <Suspense fallback={<p>Loading profitability…</p>}>
      <Profitability />
    </Suspense>
  );
}
