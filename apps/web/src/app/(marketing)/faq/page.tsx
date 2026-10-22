import type { Metadata } from "next";
import { SERVER_API_BASE_URL } from "@/lib/api-base";
import { Container, Section } from "@/components/ui/layout";
import { HelpCircle } from "lucide-react";
import { FaqSearch } from "@/components/marketing/faq-search";
import { getLogger } from "@actorconsole/shared";
import { PageHero } from "@/components/marketing/page-hero";
import Link from "next/link";
import { ChromeExtensionLink } from "@/components/chrome-extension-link";

export const dynamic = "force-dynamic";
const log = getLogger("web:faq");

export const metadata: Metadata = {
  title: "FAQ — ActorConsole",
  description:
    "Frequently asked questions about ActorConsole, pricing, Apify integration, and more.",
};

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export default async function FaqPage() {
  let groups: Array<{ category: string; items: FaqItem[] }> = [];
  let loadFailed = false;

  try {
    const response = await fetch(SERVER_API_BASE_URL + "/faq", { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error("FAQ API unavailable");
    const body = await response.json();
    groups = (body.data.groups as typeof groups).filter((group) => !["pricing", "Pricing"].includes(group.category));
  } catch (error) {
    loadFailed = true;
    log.error({ error }, "Could not load published FAQs");
  }

  return (
    <main className="marketing-page flex-1">
      <PageHero
        tone="ink"
        kicker="FAQ / help center"
        title={<>Answers for the work between builds.</>}
        description="Quick answers to common questions about ActorConsole, integrations, billing, and the model context protocol."
      />

      {/* ── Accordion List ── */}
      <Section variant="muted" className="pb-24 pt-12">
        <Container className="max-w-5xl">
          <div className="border-border mb-8 space-y-3 border-b pb-8">
            <h2 className="font-display-tight text-foreground text-xl">
              Connect your Apify account
            </h2>
            <p className="text-muted-foreground max-w-2xl text-sm leading-6">
              Install the ActorConsole Apify Connector to connect an Apify Console session to your
              workspace. Follow the{" "}
              <Link
                href="/docs/apify-connection"
                className="text-foreground underline underline-offset-4"
              >
                connection guide
              </Link>{" "}
              for installation, sign-in, and authorization steps.
            </p>
            <ChromeExtensionLink />
          </div>
          {loadFailed ? (
            <div className="blueprint-frame bg-paper p-8 py-20 text-center">
              <HelpCircle className="text-slate mx-auto h-10 w-10" />
              <p className="text-graphite mt-4 text-sm font-semibold">
                The help center is temporarily unavailable. Please try again later.
              </p>
            </div>
          ) : groups.length === 0 ? (
            <div className="blueprint-frame bg-paper p-8 py-20 text-center">
              <HelpCircle className="text-slate mx-auto h-10 w-10" />
              <p className="text-graphite mt-4 text-sm font-semibold">
                No FAQs published yet. Check back soon.
              </p>
            </div>
          ) : (
            <FaqSearch groups={groups} />
          )}
        </Container>
      </Section>
    </main>
  );
}
