import { isRestrictedDashboardPath } from "@actorconsole/shared/workspace-access";
import {
  Activity,
  BarChart3,
  BookOpen,
  CreditCard,
  DollarSign,
  Download,
  FileWarning,
  History,
  Receipt,
  Search,
  Bookmark,
  LayoutDashboard,
  LifeBuoy,
  PlugZap,
  UploadCloud,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export const DASHBOARD_STATUS_CHANGED_EVENT = "actorconsole:dashboard-status-changed";

export type NavigationStatusKey = "unreadNotifications" | "credentialIssue" | "expiredApiKeys";

export interface DashboardNavigationItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  external?: boolean;
  statusKey?: NavigationStatusKey;
  minimumPlan?: "PRO";
}

export interface DashboardNavigationGroup {
  label: string;
  defaultOpen?: boolean;
  items: DashboardNavigationItem[];
}

export const accountNavigation: DashboardNavigationItem[] = [
  { id: "account-profile", href: "/dashboard/profile", label: "Profile", icon: UserRound },
  {
    id: "account-notifications",
    href: "/dashboard/notification-preferences",
    label: "Notification preferences",
    icon: SlidersHorizontal,
  },
  {
    id: "account-billing",
    href: "/dashboard/billing",
    label: "Billing",
    icon: CreditCard,
    exact: true,
  },
  {
    id: "account-payments",
    href: "/dashboard/billing/history",
    label: "Payment history",
    icon: Receipt,
  },
  {
    id: "account-export",
    href: "/dashboard/data-export",
    label: "Data export",
    icon: Download,
  },
  {
    id: "account-settings",
    href: "/dashboard/account",
    label: "Account deletion",
    icon: FileWarning,
  },
];

export const dashboardNavigation: DashboardNavigationGroup[] = [
  {
    label: "Workspace",
    defaultOpen: true,
    items: [
      {
        id: "overview",
        href: "/dashboard",
        label: "Overview",
        icon: LayoutDashboard,
        exact: true,
      },
      { id: "actors", href: "/dashboard/actors", label: "Actors", icon: Sparkles },
      {
        id: "keywords",
        href: "/dashboard/keywords",
        label: "Keyword research",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "Research",
    items: [
      { id: "research", href: "/dashboard/research", label: "Actor discovery", icon: Search },
      { id: "watchlist", href: "/dashboard/watchlist", label: "Watchlist", icon: Bookmark },
      { id: "seo", href: "/dashboard/tools/seo", label: "SEO audit", icon: BarChart3 },
      {
        id: "pricing-tool",
        href: "/dashboard/tools/pricing",
        label: "Pricing calculator",
        icon: DollarSign,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "activity", href: "/dashboard/activity", label: "Activity", icon: History },
      {
        id: "publishing",
        href: "/dashboard/publishing",
        label: "Publishing",
        icon: UploadCloud,
      },
      { id: "usage", href: "/dashboard/usage", label: "Usage", icon: Activity },
      { id: "costs", href: "/dashboard/costs", label: "Costs", icon: DollarSign },
      { id: "revenue", href: "/dashboard/revenue", label: "Revenue", icon: TrendingUp },
      {
        id: "profitability",
        href: "/dashboard/profitability",
        label: "Profitability",
        icon: DollarSign,
      },
    ],
  },
  {
    label: "Developer",
    items: [
      {
        id: "apify-connection",
        href: "/dashboard/apify",
        label: "Apify connection",
        icon: PlugZap,
        statusKey: "credentialIssue",
      },
      {
        id: "mcp",
        href: "/dashboard/mcp",
        label: "MCP access",
        icon: TerminalSquare,
        statusKey: "expiredApiKeys",
      },
    ],
  },
  {
    label: "Help",
    items: [
      { id: "support", href: "/dashboard/support", label: "Support", icon: LifeBuoy },
      {
        id: "documentation",
        href: "/docs",
        label: "Documentation",
        icon: BookOpen,
        external: true,
      },
    ],
  },
];

export function activeNavigationGroup(pathname: string) {
  return dashboardNavigation.find((group) =>
    group.items.some((item) => navigationItemActive(pathname, item)),
  );
}

export function navigationItemActive(
  pathname: string,
  item: Pick<DashboardNavigationItem, "href" | "exact" | "external">,
) {
  if (item.external) return false;
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function visibleDashboardNavigation(restricted: boolean): DashboardNavigationGroup[] {
  if (!restricted) return dashboardNavigation;
  return dashboardNavigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !isRestrictedDashboardPath(item.href)),
    }))
    .filter((group) => group.items.length > 0);
}
