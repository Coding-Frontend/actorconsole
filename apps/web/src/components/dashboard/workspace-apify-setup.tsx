"use client";

import Link from "next/link";
import { PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApifyConnectionGuide } from "@/components/dashboard/apify-connection-guide";
import type { WorkspaceApifySetupReason } from "@/lib/workspace-apify-connection";

const messages: Record<
  WorkspaceApifySetupReason,
  { title: string; description: string; action: string }
> = {
  connect: {
    title: "Connect Apify to this workspace",
    description:
      "This workspace has no Apify account connected yet. Add an Apify API key to load your Actors, synchronize usage, and enable publishing. Connections are saved separately for each workspace.",
    action: "Connect Apify",
  },
  "api-key": {
    title: "Add an Apify API key",
    description:
      "A Console connection is saved, but this workspace still needs an API key to load Actors, synchronize usage, and publish. Add the API key for the account or organization used by this workspace.",
    action: "Add API key",
  },
  "repair-api": {
    title: "Update your Apify API key",
    description:
      "The saved API key needs attention. Check or replace it in this workspace's Apify connection, then synchronize your Actors again.",
    action: "Review Apify connection",
  },
  console: {
    title: "Connect Apify Console for account analytics",
    description:
      "Your API key can load Actors and run API operations. Add a working Console browser session to synchronize account costs and creator revenue for this workspace.",
    action: "Connect Apify Console",
  },
  unavailable: {
    title: "Could not check the Apify connection",
    description:
      "The connection status is temporarily unavailable. Retry the check or open this workspace's Apify settings to review its credentials.",
    action: "Review Apify connection",
  },
};

export function WorkspaceApifySetup({
  reason,
  compact = false,
  onRetry,
}: {
  reason: WorkspaceApifySetupReason;
  compact?: boolean;
  onRetry?: () => void;
}) {
  const message = messages[reason];
  return (
    <section
      aria-label="Apify workspace setup"
      className={`border-border bg-card rounded-sm border ${compact ? "p-4" : "p-6 sm:p-8"}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <PlugZap className="text-signal-orange mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className={compact ? "text-sm font-semibold" : "text-lg font-semibold"}>
              {message.title}
            </h2>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
              {message.description}
            </p>
            {!compact && reason !== "unavailable" ? (
              <p className="text-muted-foreground mt-2 text-sm">
                After connecting, sync your Actors. Analytics will appear as Apify data is
                synchronized.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/dashboard/apify">{message.action}</Link>
          </Button>
          <ApifyConnectionGuide />
          {reason === "unavailable" && onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry connection check
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
