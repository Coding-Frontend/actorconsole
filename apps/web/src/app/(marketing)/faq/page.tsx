import { absoluteUrl, breadcrumbStructuredData, createPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { SERVER_API_BASE_URL } from "@/lib/api-base";
import { Container, Section } from "@/components/ui/layout";
import { FaqSearch } from "@/components/marketing/faq-search";
import { getLogger } from "@actorconsole/shared";
import { PageHero } from "@/components/marketing/page-hero";
import Link from "next/link";
import { ChromeExtensionLink } from "@/components/chrome-extension-link";
import { JsonLd } from "@/components/seo/json-ld";
import { mergeFaqGroups, type FaqGroup } from "@/lib/product-faq";

export const dynamic = "force-dynamic";
const log = getLogger("web:faq");

export const metadata: Metadata = createPageMetadata({
  title: "Frequently Asked Questions",
  description:
    "Find answers about ActorConsole accounts, pricing, Apify integration, publishing, and tools for managing your Actor portfolio.",
  path: "/faq",
  image: "faq",
});

export default async function FaqPage() {
  let published: FaqGroup[] = [];
  let loadFailed = false;

  try {
    const response = await fetch(SERVER_API_BASE_URL + "/faq", {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error("FAQ API unavailable");
    const body = await response.json();
    if (!body.ok || !Array.isArray(body.data?.groups)) throw new Error("Invalid FAQ response");
    published = (body.data.groups as FaqGroup[]).filter(
      (group) => group.category.toLowerCase() !== "pricing",
    );
  } catch (error) {
    loadFailed = true;
    log.error({ error }, "Could not load published FAQs");
  }
  const groups = mergeFaqGroups(published);

  return (
    <main className="marketing-page flex-1">
      <JsonLd
        data={breadcrumbStructuredData([
          { name: "Home", path: "/" },
          { name: "Frequently Asked Questions", path: "/faq" },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "@id": absoluteUrl("/faq#questions"),
          url: absoluteUrl("/faq"),
          inLanguage: "en",
          mainEntity: groups.flatMap((group) =>
            group.items.map(({ question, answer }) => ({
              "@type": "Question",
              name: question,
              acceptedAnswer: { "@type": "Answer", text: answer },
            })),
          ),
        }}
      />
      <PageHero
        tone="ink"
        kicker="FAQ / help center"
        title={<>Answers for the work between builds.</>}
        description="Quick answers to common questions about ActorConsole, integrations, billing, and the model context protocol."
      />

      {/* ── Accordion List ── */}
      <Section variant="muted" className="pb-24 pt-12">
        <Container className="max-w-5xl">
          <div className="mb-8 space-y-3 border-b border-border pb-8">
            <h2 className="font-display-tight text-xl text-foreground">
              Connect your Apify account
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
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
          {loadFailed && (
            <p className="mb-6 text-sm text-muted-foreground" role="status">
              Additional help-center answers are temporarily unavailable. Product help is below.
            </p>
          )}
          <FaqSearch groups={groups} />
          <nav
            aria-label="Related product guides"
            className="mt-10 flex flex-wrap gap-x-6 gap-y-4 border-t border-border pt-6 text-sm"
          >
            <Link href="/docs" className="underline underline-offset-4">
              Getting started
            </Link>
            <Link href="/docs/apify-connection" className="underline underline-offset-4">
              Apify connection
            </Link>
            <Link href="/docs/ai-listing-studio" className="underline underline-offset-4">
              Listing improvements
            </Link>
            <Link href="/docs/analytics-usage-costs" className="underline underline-offset-4">
              Usage and costs
            </Link>
            <Link href="/docs/mcp-quickstart" className="underline underline-offset-4">
              MCP setup
            </Link>
          </nav>
        </Container>
      </Section>
    </main>
  );
}
