import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/layout";
import { Panel } from "@/components/ui/panel";
import { ContactForm } from "@/components/marketing/contact-form";
import { PageHero } from "@/components/marketing/page-hero";
import { Mail, LifeBuoy, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact — ActorConsole",
  description:
    "Get in touch with the ActorConsole team. Reach out for support, partnerships, or general inquiries.",
};

export default function ContactPage() {
  return (
    <main className="marketing-page flex-1">
      <PageHero
        tone="ink"
        kicker="Contact support"
        title={<>Get in touch with the people behind the console.</>}
        description="Have questions about ActorConsole, need technical assistance, or want to explore custom integrations? Drop us a line."
      />

      {/* Main split-screen section */}
      <Section variant="muted" className="pb-20 pt-12">
        <Container className="max-w-5xl">
          <div className="blueprint-bento items-start lg:grid-cols-2">
            {/* Left Column: Details */}
            <div className="space-y-6 p-6 sm:p-8 lg:p-10">
              <h2 className="font-display-tight text-carbon text-2xl">Contact Details</h2>
              <p className="text-graphite text-sm leading-relaxed">
                Use the form for product and partnership questions. Signed-in customers can create a
                support ticket with a persistent reply thread.
              </p>

              {/* Direct channels */}
              <div className="blueprint-bento sm:grid-cols-2">
                <Panel variant="default" radius="none" className="blueprint-cell border-0 p-6">
                  <div className="bg-signal-orange/10 text-signal-orange flex h-10 w-10 items-center justify-center rounded-full">
                    <Mail className="h-5 w-5" />
                  </div>
                  <h3 className="text-carbon mt-4 text-sm font-semibold">Contact form</h3>
                  <p className="text-graphite mt-1 text-xs leading-relaxed">
                    Messages are delivered through the configured support mailbox.
                  </p>
                  <p className="text-signal-orange mt-3 text-xs font-semibold">
                    Complete the form on this page
                  </p>
                </Panel>

                <Panel variant="default" radius="none" className="blueprint-cell border-0 p-6">
                  <div className="bg-signal-orange/10 text-signal-orange flex h-10 w-10 items-center justify-center rounded-full">
                    <LifeBuoy className="h-5 w-5" />
                  </div>
                  <h3 className="text-carbon mt-4 text-sm font-semibold">Account support</h3>
                  <p className="text-graphite mt-1 text-xs leading-relaxed">
                    Create and follow a ticket from your dashboard.
                  </p>
                  <Link
                    href="/dashboard/support/new"
                    className="text-signal-orange mt-3 inline-block text-xs font-semibold hover:underline"
                  >
                    Open a support ticket
                  </Link>
                </Panel>
              </div>

              {/* Help Center CTA */}
              <div className="border-chalk bg-fog flex items-center justify-between rounded-lg border p-5 text-xs">
                <span className="text-graphite font-medium">
                  Looking for quick setup instructions?
                </span>
                <Link
                  href="/docs"
                  className="text-signal-orange inline-flex shrink-0 items-center gap-1 font-semibold hover:underline"
                >
                  View documentation
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {/* Quick links */}
              <div className="space-y-2">
                <p className="text-slate text-xs font-semibold uppercase tracking-wider">
                  Quick links
                </p>
                {[
                  { href: "/faq", label: "Check our FAQ" },
                  { href: "/status", label: "System status" },
                  { href: "/docs", label: "Documentation" },
                ].map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="text-graphite hover:bg-fog hover:text-carbon flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
                  >
                    <ArrowRight className="text-signal-orange h-3 w-3" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Right Column: Form */}
            <Panel
              variant="default"
              radius="none"
              className="blueprint-cell bg-paper border-0 p-6 sm:p-8 lg:p-10"
            >
              <div className="mb-6">
                <h2 className="font-display-tight text-carbon text-xl">Send a Message</h2>
                <p className="text-graphite mt-1 text-xs">
                  Fill out the form below and we will get back to you shortly.
                </p>
              </div>
              <ContactForm />
            </Panel>
          </div>
        </Container>
      </Section>
    </main>
  );
}
