import { redirect } from "next/navigation";

export default async function UsageCostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const target = params.view === "revenue" ? "/dashboard/revenue" : "/dashboard/costs";
  const forwarded = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    if (key === "view") continue;
    const values = Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : [];
    for (const value of values) forwarded.append(key, value);
  }
  redirect(forwarded.size ? `${target}?${forwarded.toString()}` : target);
}
