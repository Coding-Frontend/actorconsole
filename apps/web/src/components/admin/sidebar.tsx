"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Bot,
  KeyRound,
  BarChart3,
  Webhook,
  AlertTriangle,
  FileText,
  ScrollText,
  Receipt,
  ListTree,
  LifeBuoy,
  Scale,
  DollarSign,
  Megaphone,
  HelpCircle,
  Activity,
  Mail,
  Send,
  X,
  CalendarDays,
  Gauge,
  ToggleLeft,
  BrainCircuit,
  Images,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ActorMark } from "@/components/brand/actor-mark";
import { useAdminSidebar } from "./sidebar-provider";
import { NavigationDrawer } from "@/components/ui/navigation-drawer";

const groups = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/admin/usage-costs", label: "Usage costs", icon: DollarSign },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
      { href: "/admin/payments", label: "Payments", icon: Receipt },
      { href: "/admin/support", label: "Support", icon: LifeBuoy },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/admin/actors", label: "Actors", icon: Bot },
      { href: "/admin/website-logos", label: "Website logos", icon: Images },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/integrations", label: "Integrations", icon: KeyRound },
      { href: "/admin/ai-providers", label: "AI providers", icon: BrainCircuit },
      { href: "/admin/feature-flags", label: "Feature flags", icon: ListTree },
      { href: "/admin/plan-features", label: "Plan marketing copy", icon: ListTree },
      { href: "/admin/payment-gateways", label: "Payment gateways", icon: ToggleLeft },
      { href: "/admin/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/admin/errors", label: "Errors", icon: AlertTriangle },
      { href: "/admin/audit-log", label: "Audit log", icon: ScrollText },
      { href: "/admin/newsletter", label: "Newsletter", icon: Mail },
      { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
      { href: "/admin/changelog", label: "Changelog", icon: CalendarDays },
      { href: "/admin/faq-admin", label: "FAQ", icon: HelpCircle },
      { href: "/admin/incidents", label: "Incidents", icon: Activity },
      { href: "/admin/email-log", label: "Email log", icon: Send },
      { href: "/admin/usage", label: "Usage", icon: Gauge },
      { href: "/admin/policies", label: "Policies", icon: Scale },
      { href: "/admin/blog", label: "Blog", icon: FileText },
    ],
  },
];

export function AdminSidebar() {
  const { mobileOpen, closeMobile } = useAdminSidebar();
  const pathname = usePathname();

  const sidebarContent = (
    <>
      <div className="app-shell-header-row border-border/80 flex items-center justify-between border-b px-5">
        <Link href="/admin" className="flex min-w-0 items-center gap-2.5" onClick={closeMobile}>
          <ActorMark size={30} />
          <span className="min-w-0">
            <span className="font-display-tight block truncate text-[17px] leading-none">
              ActorConsole
            </span>
            <span className="text-muted-foreground mt-1 block truncate font-mono text-[9px] uppercase tracking-[0.16em]">
              Control room
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={closeMobile}
          className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex items-center justify-center rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 lg:hidden"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav
        className="scroll-soft min-h-0 flex-1 overflow-y-auto px-3 py-4"
        aria-label="Administration"
      >
        {groups.map((g) => (
          <div key={g.label} className="mb-5">
            <p className="data-stamp text-muted-foreground/80 mb-1.5 px-3 uppercase tracking-[0.12em]">
              {g.label}
            </p>
            <div className="space-y-0.5">
              {g.items.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={closeMobile}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "focus-visible:ring-ring group relative flex min-h-8 items-center gap-3 rounded-[5px] border border-transparent px-3 py-1.5 text-[13px] font-medium transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2",
                      active
                        ? "border-signal-orange/25 bg-signal-orange/10 text-foreground shadow-sm"
                        : "text-muted-foreground hover:border-border/80 hover:bg-accent/70 hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute inset-y-1.5 left-0 w-0.5 rounded-r-full",
                        active
                          ? "bg-signal-orange"
                          : "group-hover:bg-signal-blue/60 bg-transparent",
                      )}
                    />
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-colors",
                        active ? "text-signal-orange" : "group-hover:text-signal-blue",
                      )}
                      strokeWidth={active ? 2.2 : 1.8}
                    />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-border/80 bg-muted/30 shrink-0 border-t px-5 py-3">
        <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.1em]">
          <span className="text-muted-foreground">ActorConsole admin</span>
          <span className="text-signal-green inline-flex items-center gap-1.5">
            <span className="bg-signal-green h-1.5 w-1.5 rounded-full" />
            {process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "unknown"}
          </span>
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside className="border-border/80 bg-card sticky top-0 hidden h-dvh w-[264px] min-w-0 shrink-0 basis-[264px] flex-col border-r lg:flex">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      <NavigationDrawer open={mobileOpen} onClose={closeMobile} title="Administration navigation" className="lg:hidden">
        {sidebarContent}
      </NavigationDrawer>
    </>
  );
}
