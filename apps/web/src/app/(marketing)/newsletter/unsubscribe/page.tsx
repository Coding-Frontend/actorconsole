import { createPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/layout";
import { UnsubscribeClient } from "./unsubscribe-client";
import { PageHero } from "@/components/marketing/page-hero";

export const metadata: Metadata = createPageMetadata({
  title: "Newsletter Preferences",
  description: "Update your ActorConsole newsletter subscription preferences.",
  path: "/newsletter/unsubscribe",
  image: "home",
  noIndex: true,
});

export default function UnsubscribePage() {
  return (
    <main className="marketing-page flex-1">
      <PageHero
        tone="ink"
        kicker="Newsletter preferences"
        title={<>Keep your inbox useful.</>}
        description="Update your ActorConsole newsletter preference below."
      />
      <Section variant="muted" className="pt-12">
        <Container className="flex justify-center">
          <UnsubscribeClient />
        </Container>
      </Section>
    </main>
  );
}
