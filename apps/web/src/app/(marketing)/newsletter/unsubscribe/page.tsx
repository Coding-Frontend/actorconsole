import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/layout";
import { UnsubscribeClient } from "./unsubscribe-client";
import { PageHero } from "@/components/marketing/page-hero";

export const metadata: Metadata = {
  title: "Unsubscribe — ActorConsole Newsletter",
  description: "Unsubscribe from the ActorConsole newsletter.",
  robots: { index: false, follow: false },
};

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
