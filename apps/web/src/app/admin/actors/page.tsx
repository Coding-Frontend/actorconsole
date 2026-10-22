import { PageHeader } from "@/components/admin/page-header";
import { AdminActorsTable } from "@/components/admin/actors-table";

export default async function AdminActorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeader title="Actors" description="Tracked actors across all users" />
      <AdminActorsTable initialParams={params} />
    </div>
  );
}
