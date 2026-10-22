"use client";

import Link from "next/link";
import { CalendarClock, ListFilter, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { ALL_WORKSPACES_PUBLISHING_PATH } from "@actorconsole/shared/default-dashboard";

interface BulkPublishingHeaderProps {
  active: "inventory" | "schedules" | "new";
  selectionCount?: number;
  onClearSelection?: () => void;
}

export function BulkPublishingHeader({
  active,
  selectionCount = 0,
  onClearSelection,
}: BulkPublishingHeaderProps) {
  return (
    <header className="space-y-3">
      <DashboardPageHeader
        context="Operations / Store control"
        title={active === "new" ? "Create publishing schedule" : "Publishing"}
        description={
          active === "new"
            ? "Choose the Actors, daily capacity, and run time for this publishing queue."
            : "Coordinate Store status and daily publishing with a visible trail for every Actor."
        }
        breadcrumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Publishing", href: "/dashboard/publishing" },
          {
            label:
              active === "new"
                ? "New schedule"
                : active === "schedules"
                  ? "Schedules"
                  : "Inventory",
          },
        ]}
        status={
          selectionCount > 0 ? (
            <span className="text-signal-blue font-mono text-[10px] uppercase">
              {selectionCount} selected
            </span>
          ) : undefined
        }
        secondaryActions={
          selectionCount > 0 && onClearSelection
            ? [{ label: "Clear selection", onSelect: onClearSelection }]
            : []
        }
        primaryAction={
          active !== "new" ? (
            <Button variant="signal" size="sm" className="w-full sm:w-auto" asChild>
              <Link href="/dashboard/publishing/schedules/new">
                <Plus className="h-3.5 w-3.5" /> New schedule
              </Link>
            </Button>
          ) : undefined
        }
      />
      <nav
        className="border-border bg-card flex flex-wrap items-center gap-1 rounded-sm border p-1"
        aria-label="Publishing sections"
      >
        <Button size="sm" variant={active === "inventory" ? "secondary" : "ghost"} asChild>
          <Link href="/dashboard/publishing">
            <ListFilter className="h-3.5 w-3.5" /> Inventory
          </Link>
        </Button>
        <Button size="sm" variant={active === "schedules" ? "secondary" : "ghost"} asChild>
          <Link href="/dashboard/publishing/schedules">
            <CalendarClock className="h-3.5 w-3.5" /> Schedules
          </Link>
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link href={ALL_WORKSPACES_PUBLISHING_PATH}>All Workspaces overview</Link>
        </Button>
      </nav>
    </header>
  );
}
