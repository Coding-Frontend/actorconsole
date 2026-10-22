import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";

type PageHeroTone = "ink" | "paper" | "fog";

type PageHeroProps = {
  kicker: string;
  title: ReactNode;
  description: ReactNode;
  aside?: ReactNode;
  tone?: PageHeroTone;
  className?: string;
};

const tones: Record<PageHeroTone, { section: string; kicker: string; body: string }> = {
  ink: {
    section: "semantic-accent-panel text-foreground",
    kicker: "text-signal-orange",
    body: "text-muted-foreground",
  },
  paper: {
    section: "bg-mist text-foreground",
    kicker: "text-signal-orange",
    body: "text-muted-foreground",
  },
  fog: {
    section: "bg-fog text-foreground",
    kicker: "text-signal-orange",
    body: "text-muted-foreground",
  },
};

/** A shared editorial opening that keeps each public route authored, not templated. */
export function PageHero({
  kicker,
  title,
  description,
  aside,
  tone = "paper",
  className,
}: PageHeroProps) {
  const palette = tones[tone];

  return (
    <HomeGridSection
      className={cn("page-hero-surface relative overflow-hidden", palette.section, className)}
    >
      <HomeGridRow>
        <HomeGridCell
          className={cn(
            aside ? "col-span-8" : "col-span-12",
            "px-6 py-12 sm:px-8 sm:py-16 lg:p-12",
          )}
        >
          <p className={cn("type-kicker eyebrow-line mb-8", palette.kicker)}>{kicker}</p>
          <h1 className="font-display text-foreground max-w-[15ch] text-[clamp(2.625rem,5.2vw,5.25rem)]">
            {title}
          </h1>
          <p
            className={cn(
              "mt-5 max-w-2xl text-[16px] leading-7 sm:mt-6 sm:text-[18px] sm:leading-8",
              palette.body,
            )}
          >
            {description}
          </p>
        </HomeGridCell>
        {aside ? (
          <HomeGridCell className="bg-card/5 col-span-4 flex items-end px-6 py-14 sm:px-8 sm:py-20 lg:p-10">
            <div className="w-full">{aside}</div>
          </HomeGridCell>
        ) : null}
      </HomeGridRow>
    </HomeGridSection>
  );
}
