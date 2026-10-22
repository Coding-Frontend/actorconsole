import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";

export function CtaSection() {
  return (
    <HomeGridSection className="relative overflow-hidden">
      <HomeGridRow>
        <HomeGridCell className="col-span-8 px-6 py-16 sm:px-8 sm:py-20 lg:p-12 lg:py-24">
          <p className="home-grid-kicker">Make the next release legible</p>
          <h2 className="font-display-tight text-foreground mt-5 max-w-3xl text-[42px] sm:text-[60px]">
            Stop shipping blind.{" "}
            <span className="text-signal-orange">Start shipping with data.</span>
          </h2>
          <p className="text-muted-foreground mt-5 max-w-xl text-[17px] leading-8">
            Manage Store content, schedules, publishing, and usage costs in one workspace.
          </p>
        </HomeGridCell>
        <HomeGridCell className="bg-card/45 col-span-4 flex flex-col justify-end gap-3 px-6 py-12 sm:px-8 lg:p-10 lg:py-24">
          <Button size="lg" asChild>
            <Link href="/signup">
              Start free <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/pricing">View pricing</Link>
          </Button>
        </HomeGridCell>
      </HomeGridRow>
    </HomeGridSection>
  );
}
