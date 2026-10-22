import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopbar } from "@/components/admin/topbar";
import { AdminSidebarProvider } from "@/components/admin/sidebar-provider";
import { getMimicStatus } from "@/lib/impersonation";

export const metadata = {
  title: { default: "ActorConsole Admin", template: "%s · ActorConsole Admin" },
  description: "Internal admin panel for ActorConsole.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Admin role is freshly read by the API; every admin endpoint enforces the same authorization. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (await getMimicStatus()) redirect("/dashboard");

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/admin");
  }

  const user = session.user;

  if (!user || user.suspendedAt || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect("/dashboard?error=forbidden");
  }

  return (
    <AdminSidebarProvider>
      <div className="app-shell admin-shell bg-background flex min-h-dvh w-full min-w-0">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar />
          <main className="blueprint-surface app-shell-main bg-muted/25 relative min-w-0 flex-1">
            <div className="bg-signal-orange/35 pointer-events-none absolute inset-x-0 top-0 h-px" />
            <div className="app-shell-content-container py-4 sm:py-6 lg:py-8">{children}</div>
          </main>
        </div>
      </div>
    </AdminSidebarProvider>
  );
}
