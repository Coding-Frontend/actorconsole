import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/layout";
import { Panel, PanelDescription, PanelTitle } from "@/components/ui/panel";
import { PageHero } from "@/components/marketing/page-hero";

export const metadata: Metadata = {
  title: "About — ActorConsole",
  description:
    "ActorConsole brings Apify Actor workspaces, Store content tools, publishing, costs, and available revenue into one place.",
  openGraph: {
    title: "About ActorConsole",
    description: "A focused operations workspace for Apify Actor builders.",
  },
};

const capabilities = [
  "Create and switch between separate Actor workspaces",
  "Connect Apify and keep owned Actors up to date",
  "Store copy, keyword watchlist, and pricing tools",
  "Scheduled Actor publishing, readiness checks, and bulk status changes",
  "Apify usage costs, run statistics, and available creator revenue and profit reporting",
  "MCP tools for supported actor workflows",
];

export default function AboutPage() {
  return (
    <main className="marketing-page flex-1">
      <PageHero
        tone="ink"
        kicker="About ActorConsole"
        title={<>Operations tooling for Apify Actor builders.</>}
        description="ActorConsole consolidates actor management, recurring work, Store content assistance, publishing, and account usage reporting."
      />

      <Section variant="default">
        <Container className="max-w-3xl">
          <Panel variant="default" radius="none" className="blueprint-frame">
            <PanelTitle className="text-[28px]">Current scope</PanelTitle>
            <PanelDescription className="mt-2">
              Some features require a connected provider.
            </PanelDescription>
            <ul className="text-graphite mt-6 list-disc space-y-2 pl-5 text-sm">
              {capabilities.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
          </Panel>
        </Container>
      </Section>

      <Section variant="ink">
        <Container className="max-w-3xl text-center">
          <h2 className="font-display-tight text-[32px] text-white sm:text-[40px]">
            Explore the workflow
          </h2>
          <p className="text-body mx-auto mt-4 max-w-xl text-white/65">
            Review the documentation and plan limits before connecting production accounts.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/docs">
                Read documentation
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/pricing">View pricing</Link>
            </Button>
          </div>
        </Container>
      </Section>
    </main>
  );
}
