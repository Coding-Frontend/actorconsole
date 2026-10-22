import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Building2, Code2 } from "lucide-react";
import { Container, Section } from "@/components/ui/layout";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/marketing/page-hero";

export const metadata: Metadata = {
  title: "For Apify Builders — ActorConsole",
  description:
    "ActorConsole workflows for independent Apify developers, studios, and engineering teams.",
};

const useCases = [
  {
    icon: Code2,
    title: "Independent builders",
    body: "Keep actor metadata, pricing, schedules, publishing, and usage-cost context in one workspace.",
  },
  {
    icon: Building2,
    title: "Actor studios",
    body: "Coordinate a larger actor portfolio with repeatable publishing workflows.",
  },
  {
    icon: Bot,
    title: "AI-assisted teams",
    body: "Use MCP tools to inspect actors and invoke supported workflows from coding agents.",
  },
];

export default function CustomersPage() {
  return (
    <main className="marketing-page flex-1">
      <PageHero
        tone="ink"
        kicker="Built for Apify teams"
        title={<>One operating surface for your actor portfolio.</>}
        description="ActorConsole brings actor discovery, listing improvements, schedules, and account usage-cost visibility together."
      />

      <Section variant="muted" className="pt-12">
        <Container className="max-w-5xl">
          <div className="blueprint-bento md:grid-cols-3">
            {useCases.map(({ icon: Icon, title, body }) => (
              <Panel key={title} radius="none" className="blueprint-cell border-0">
                <div className="bg-signal-orange/10 text-signal-orange flex h-10 w-10 items-center justify-center rounded-lg">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="font-display-tight text-carbon mt-5 text-xl">{title}</h2>
                <p className="text-graphite mt-3 text-sm leading-relaxed">{body}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </Section>

      <Section variant="ink">
        <Container className="max-w-3xl text-center">
          <h2 className="font-display-tight text-[32px] text-white sm:text-[40px]">
            Start with up to 50 actors
          </h2>
          <p className="text-body-lg mt-4 text-white/65">
            Connect your Apify account and verify the workflow with your own data.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/signup">
                Create an account
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/docs">Read the docs</Link>
            </Button>
          </div>
        </Container>
      </Section>
    </main>
  );
}
