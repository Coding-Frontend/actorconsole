import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NewTicketForm } from "@/components/dashboard/new-ticket-form";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { authenticatedServerFetch } from "@/lib/server-api";

const supportContexts = {
  connection: {
    subject: "Apify connection needs help",
    body: "I need help connecting Apify to this workspace.\n\nWhat happened:\n",
    category: "TECHNICAL",
  },
  publishing: {
    subject: "Publishing run needs help",
    body: "I need help with an Actor publishing run.\n\nWhat happened:\n",
    category: "TECHNICAL",
  },
  optimization: {
    subject: "Actor improvement needs help",
    body: "I need help reviewing or applying an Actor improvement.\n\nWhat happened:\n",
    category: "TECHNICAL",
  },
  billing: {
    subject: "Billing question",
    body: "I need help with my workspace subscription.\n\nQuestion:\n",
    category: "BILLING",
  },
} as const;

export default async function NewSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; actorId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/support/new");
  const params = await searchParams;
  const context =
    params.from && params.from in supportContexts
      ? supportContexts[params.from as keyof typeof supportContexts]
      : null;
  const actorId =
    typeof params.actorId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(params.actorId)
      ? params.actorId
      : null;
  let relatedActor: {
    id: string;
    apifyActorId: string;
    title: string | null;
    actorName: string;
  } | null = null;
  if (actorId) {
    const response = await authenticatedServerFetch(
      `/actors/by-id/${encodeURIComponent(actorId)}?tab=manage`,
    );
    if (response.ok) {
      const body = await response.json().catch(() => null);
      const actor = body?.data?.actor ?? body?.data;
      if (actor?.id === actorId)
        relatedActor = {
          id: actor.id,
          apifyActorId: actor.apifyActorId,
          title: actor.title ?? null,
          actorName: actor.actorName,
        };
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DashboardPageHeader
        context="Help / Support"
        title="Open a ticket"
        description="Tell us what's happening. This ticket will be linked to your current workspace."
        secondaryActions={[
          {
            label: "Back to tickets",
            href: "/dashboard/support",
            icon: <ArrowLeft className="h-3.5 w-3.5" />,
          },
        ]}
      />
      {context ? (
        <p className="border-border bg-muted/30 rounded-md border p-3 text-sm">
          We filled in the topic. Add what happened and what you expected before sending.
        </p>
      ) : null}
      <NewTicketForm
        initialSubject={context?.subject ?? ""}
        initialCategory={context?.category ?? "TECHNICAL"}
        initialBody={context?.body ?? ""}
        initialActorId={relatedActor?.id ?? ""}
        actors={relatedActor ? [relatedActor] : []}
      />
    </div>
  );
}
