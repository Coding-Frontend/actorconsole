import { NewsletterSubscribe } from "./newsletter-subscribe";
import Link from "next/link";
import { FileText, TrendingUp, CalendarClock, Sparkles } from "lucide-react";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";

const perks = [
  { icon: FileText, label: "Build breakdowns & Store teardowns" },
  { icon: TrendingUp, label: "Keyword & ranking insights you can act on" },
  { icon: CalendarClock, label: "Changelog snapshots — what shipped, what's next" },
  { icon: Sparkles, label: "AI-assisted Actor copy, schemas & README files" },
] as const;

export function NewsletterCta() {
  return (
    <HomeGridSection className="bg-fog/35">
      <HomeGridRow>
        <HomeGridCell className="col-span-6 px-6 py-14 sm:px-8 sm:py-16 lg:p-12">
          <p className="home-grid-kicker">The builder&apos;s digest</p>
          <h2 className="font-display-tight text-foreground mt-5 max-w-lg text-[40px] sm:text-[54px]">
            Stay close to the signal.
          </h2>
          <p className="text-muted-foreground mt-5 max-w-md text-base leading-7">
            A short, focused digest for Apify builders. Product updates, Store strategy, and dev
            tips — nothing you didn&apos;t sign up for.
          </p>
          <ul className="border-border mt-9 space-y-3 border-t pt-5">
            {perks.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <Icon className="text-signal-orange h-4 w-4 shrink-0" />
                <span className="text-muted-foreground">{label}</span>
              </li>
            ))}
          </ul>
        </HomeGridCell>

        <HomeGridCell className="bg-card/45 col-span-6 flex flex-col justify-center px-6 py-14 sm:px-8 sm:py-16 lg:p-12">
          <p className="home-grid-kicker">Join the digest</p>
          <h3 className="font-display-tight text-foreground mt-5 text-[30px] sm:text-[38px]">
            Free, every two weeks.
          </h3>
          <p className="text-muted-foreground mt-3 max-w-sm text-sm leading-6">
            No spam. Unsubscribe anytime.
          </p>
          <div className="mt-8 w-full max-w-lg">
            <NewsletterSubscribe />
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            By subscribing you agree to our{" "}
            <Link href="/legal/privacy" className="underline underline-offset-2">privacy policy</Link>.
          </p>
        </HomeGridCell>
      </HomeGridRow>
    </HomeGridSection>
  );
}
