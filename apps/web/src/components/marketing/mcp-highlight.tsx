import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";

type McpClient = {
  name: string;
  description: string;
  logo: string;
  logoAlt: string;
  logoClassName?: string;
  glow: string;
};

const clients: McpClient[] = [
  {
    name: "Codex",
    description:
      "Connect ActorConsole to Codex and operate your actor workspace directly from your coding agent.",
    logo: "/ai-tools-logos/codex.svg",
    logoAlt: "Codex logo",
    logoClassName: "dark:invert",
    glow: "bg-[radial-gradient(circle_at_35%_35%,rgba(99,102,241,0.28),transparent_62%)]",
  },
  {
    name: "Claude",
    description:
      "Connect ActorConsole to Claude Code and keep the same permissions and audit trail while you work.",
    logo: "/ai-tools-logos/claude-color.svg",
    logoAlt: "Claude logo",
    glow: "bg-[radial-gradient(circle_at_35%_35%,rgba(217,119,87,0.22),transparent_62%)]",
  },
  {
    name: "Cursor",
    description:
      "Connect ActorConsole to Cursor and bring structured actor operations into your editor.",
    logo: "/ai-tools-logos/cursor-icon.svg",
    logoAlt: "Cursor logo",
    logoClassName: "dark:invert",
    glow: "bg-[radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.14),transparent_62%)]",
  },
];

export function McpHighlight() {
  return (
    <HomeGridSection className="overflow-hidden">
      <HomeGridRow>
        <HomeGridCell className="col-span-12">
          <Link
            href="/docs"
            className="hover:bg-card/70 group block px-6 py-14 transition-colors sm:px-8 sm:py-16 lg:flex lg:items-end lg:justify-between lg:gap-12 lg:p-12"
          >
            <div className="min-w-0 max-w-3xl">
              <p className="home-grid-kicker mb-5">MCP server / your workflow</p>
              <h2 className="font-display-tight text-foreground text-4xl font-semibold sm:text-5xl">
                Build where you <span className="text-signal-orange">want.</span>
              </h2>
              <p className="text-muted-foreground mt-5 max-w-3xl text-base leading-7 sm:text-lg sm:leading-8">
                Connect the ActorConsole MCP server to your favorite AI coding tool so it can
                inspect actors and use supported Actor operations from the place you already build.
              </p>
            </div>
            <span className="group-hover:text-signal-orange text-foreground mt-8 inline-flex shrink-0 items-center gap-2 text-sm font-medium transition-colors lg:mb-1 lg:mt-0">
              Read MCP server docs
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          </Link>
        </HomeGridCell>
      </HomeGridRow>

      <HomeGridRow>
        {clients.map((client) => (
          <HomeGridCell key={client.name} className="home-grid-cell-hover col-span-4">
            <Link
              href="/docs"
              className="focus-visible:ring-ring group relative flex min-h-[360px] min-w-0 flex-col overflow-hidden px-6 py-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset motion-reduce:transition-none sm:px-8 sm:py-12 lg:min-h-[420px] lg:p-10"
            >
              <div
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-0 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-30 group-focus-visible:opacity-30 motion-reduce:transition-none",
                  client.glow,
                )}
              />

              <div className="relative z-10 flex h-full min-w-0 flex-col">
                <div className="border-border bg-card flex h-14 w-14 items-center justify-center rounded-sm border">
                  <Image
                    src={client.logo}
                    alt={client.logoAlt}
                    width={28}
                    height={28}
                    className={client.logoClassName}
                  />
                </div>

                <h3 className="font-display-tight text-foreground mt-10 text-3xl font-semibold sm:text-4xl">
                  {client.name}
                </h3>
                <p className="text-muted-foreground mt-5 max-w-[34ch] text-base leading-7 sm:text-lg sm:leading-8">
                  {client.description}
                </p>

                <span className="group-hover:text-signal-orange text-foreground mt-auto inline-flex items-center gap-2 pt-10 text-sm font-medium transition-colors">
                  Connect ActorConsole to {client.name}
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          </HomeGridCell>
        ))}
      </HomeGridRow>
    </HomeGridSection>
  );
}
