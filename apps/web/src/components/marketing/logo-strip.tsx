import Image from "next/image";
import Link from "next/link";
import { Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";

type SupportedTool = { name: string; logo?: string; logoClassName?: string };

const supportedTools: readonly SupportedTool[] = [
  { name: "Codex", logo: "/ai-tools-logos/codex.svg", logoClassName: "dark:invert" },
  { name: "Claude", logo: "/ai-tools-logos/claude-color.svg" },
  {
    name: "Cursor",
    logo: "/ai-tools-logos/cursor-icon.svg",
    logoClassName: "dark:invert",
  },
  { name: "VS Code" },
  {
    name: "GitHub Copilot",
    logo: "/ai-tools-logos/githubcopilot.svg",
    logoClassName: "dark:invert",
  },
  {
    name: "Windsurf",
    logo: "/ai-tools-logos/windsurf.svg",
    logoClassName: "dark:invert",
  },
  {
    name: "Junie",
    logo: "/ai-tools-logos/junie.svg",
    logoClassName: "dark:invert",
  },
  { name: "Zed" },
  { name: "Antigravity", logo: "/ai-tools-logos/antigravity.svg" },
  { name: "Cline", logo: "/ai-tools-logos/cline.svg", logoClassName: "dark:invert" },
  { name: "OpenCode", logo: "/ai-tools-logos/opencode.svg", logoClassName: "dark:invert" },
  { name: "Goose", logo: "/ai-tools-logos/goose.svg", logoClassName: "dark:invert" },
  { name: "Amp", logo: "/ai-tools-logos/ampcode.svg" },
  { name: "Replit", logo: "/ai-tools-logos/replit-color.svg" },
];

export function AiToolStrip() {
  return (
    <HomeGridSection>
      <HomeGridRow>
        <HomeGridCell className="col-span-3 flex items-center px-6 py-7 sm:px-8">
          <div>
            <h2 className="home-grid-index text-foreground/65">MCP-compatible IDEs & agents</h2>
            <p className="text-muted-foreground mt-2 text-xs">
              Connect the same ActorConsole server
            </p>
          </div>
        </HomeGridCell>
        <HomeGridCell className="col-span-9 px-6 py-7 sm:px-8">
          <ul className="grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-4">
            {supportedTools.map((tool) => (
              <li key={tool.name} className="min-w-0">
                <Link
                  href="/docs/mcp-quickstart"
                  className="border-border bg-card/45 text-muted-foreground hover:border-signal-orange/45 hover:text-foreground focus-visible:text-foreground group flex min-w-0 max-w-full items-center gap-2 border px-2.5 py-2.5 text-xs font-medium transition-colors sm:gap-2.5 sm:px-3"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center sm:h-6 sm:w-6">
                    {tool.logo ? (
                      <Image
                        src={tool.logo}
                        alt=""
                        aria-hidden="true"
                        width={24}
                        height={24}
                        className={cn("h-5 w-5 object-contain transition", tool.logoClassName)}
                      />
                    ) : (
                      <Code2 className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                    )}
                  </span>
                  <span className="truncate">{tool.name}</span>
                  <span className="text-signal-orange ml-auto hidden sm:inline" aria-hidden="true">
                    ↗
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </HomeGridCell>
      </HomeGridRow>
    </HomeGridSection>
  );
}
