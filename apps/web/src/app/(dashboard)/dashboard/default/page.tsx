import { redirect } from "next/navigation";
import type { DefaultDashboardPayload } from "@actorconsole/shared/default-dashboard";
import { authenticatedServerFetch } from "@/lib/server-api";
import { DefaultDashboard } from "@/components/dashboard/default-dashboard";

export default async function DefaultDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["from", "to"]) {
    if (typeof params[key] === "string") query.set(key, params[key]);
  }
  const response = await authenticatedServerFetch(
    `/account/default-dashboard${query.size ? `?${query}` : ""}`,
  );
  const body = await response.json();
  if (response.status === 409 && body.error?.code === "default_unavailable") redirect("/dashboard");
  if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Could not load earnings");
  return <DefaultDashboard payload={body.data as DefaultDashboardPayload} />;
}
