import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { PlanComparison } from "@/components/billing/plan-comparison";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { Button } from "@/components/ui/button";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";

export const metadata: Metadata = {
  title: "Plans — ActorConsole",
  description:
    "Start free with up to 50 actors and 500 monthly users. Upgrade to Pro when your portfolio or audience grows.",
};

// Pricing copy is admin-managed and must update without a redeploy.
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const session = await auth();
  const isAuthenticated = Boolean(session?.user);
  return (
    <main className="marketing-page flex-1">
      <HomeGridSection>
        <HomeGridRow>
          <HomeGridCell className="col-span-12 px-5 pb-6 pt-10 text-center sm:px-8 sm:pt-12">
            <h1 className="font-display-tight mx-auto max-w-3xl text-4xl sm:text-5xl">
              Your portfolio is growing.
              <br />
              Your workspace can too.
            </h1>
            <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-base leading-7">
              Start with every workflow on Free. Choose Pro for unlimited actors and monthly users,
              so your tools keep pace with your portfolio.
            </p>
          </HomeGridCell>
        </HomeGridRow>
      </HomeGridSection>

      <PricingCards
        homeGrid
        showIntro={false}
        sectionVariant="muted"
        isAuthenticated={isAuthenticated}
      />
      <HomeGridSection>
        <HomeGridRow>
          <HomeGridCell className="col-span-12 px-6 py-10 sm:px-8 lg:p-12">
            <div className="mx-auto max-w-5xl">
              <PlanComparison />
            </div>
          </HomeGridCell>
        </HomeGridRow>
      </HomeGridSection>

      <HomeGridSection>
        <HomeGridRow>
          <HomeGridCell className="col-span-12 px-5 py-12 sm:px-8 lg:px-12">
            <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[1fr_1.5fr] md:gap-16">
              <div>
                <h2 className="font-display-tight text-3xl">A few things to know</h2>
                <p className="text-muted-foreground mt-3 text-sm leading-6">
                  Choose with confidence. Your plan applies to the workspace you upgrade.
                </p>
                <Button asChild variant="outline" className="mt-6">
                  <Link href={isAuthenticated ? "/dashboard" : "/signup"}>
                    {isAuthenticated ? "Open dashboard" : "Create a free account"}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
              <div className="divide-border divide-y">
                {[
                  [
                    "When should I upgrade to Pro?",
                    "Free includes every workflow for up to 50 actors and 500 monthly users per workspace. Upgrade when your workspace exceeds either limit, or choose Pro now for room to grow.",
                  ],
                  [
                    "How are monthly users counted?",
                    "Monthly users are summed across your actors over the past 30 days. The same person can count in more than one actor; this is not a count of unique people across your whole portfolio.",
                  ],
                  [
                    "How does yearly billing work?",
                    "Yearly subscriptions are charged for the full year. The monthly equivalent helps you compare costs; it is not a monthly payment. Any available savings are shown beside Yearly.",
                  ],
                  [
                    "How do I upgrade?",
                    "Open workspace billing, choose your billing frequency and select Upgrade to Pro. Then enter your billing address and continue to checkout. Your workspace changes to Pro after payment is confirmed.",
                  ],
                  [
                    "Can I cancel my subscription?",
                    "You can stop future renewals from workspace billing. Access continues until the end of the current subscription period.",
                  ],
                ].map(([question, answer]) => (
                  <details key={question} className="py-5 first:pt-0">
                    <summary className="cursor-pointer text-sm font-semibold leading-6">
                      {question}
                    </summary>
                    <p className="text-muted-foreground mt-3 text-sm leading-6">{answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </HomeGridCell>
        </HomeGridRow>
      </HomeGridSection>
    </main>
  );
}
