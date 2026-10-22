import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ToolNavigation({
  active,
  surface = "public",
}: {
  active: "pricing" | "seo";
  surface?: "public" | "dashboard";
}) {
  const basePath = surface === "dashboard" ? "/dashboard/tools" : "/tools";
  return (
    <nav
      aria-label="Research tools"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm"
    >
      {[
        { id: "pricing", href: `${basePath}/pricing`, label: "Pricing calculator" },
        { id: "seo", href: `${basePath}/seo`, label: "SEO audit" },
      ].map((tool) => (
        <Link
          key={tool.id}
          href={tool.href}
          aria-current={active === tool.id ? "page" : undefined}
          className={cn(
            "border-b-2 py-2 font-medium transition-colors",
            active === tool.id
              ? "border-signal-orange text-foreground"
              : "text-muted-foreground hover:text-foreground hover:border-border border-transparent",
          )}
        >
          {tool.label}
        </Link>
      ))}
      <Link
        href={surface === "dashboard" ? "/dashboard/research" : "/research"}
        className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-2 py-2"
      >
        Actor research <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </nav>
  );
}
