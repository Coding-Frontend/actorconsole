import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { FeatureIcon } from "@/components/marketing/features/feature-icon";
import { featureMeta } from "@/components/marketing/features/features-meta";
import { HomeGridCell, HomeGridRow } from "@/components/marketing/home-grid";

export function FeatureRows({ className }: { className?: string }) {
  return (
    <div className={cn("border-border/60 border-t", className)} aria-label="ActorConsole features">
      {featureMeta.map(({ id, icon: Icon, badge, title, body, tags, number }, index) => (
        <article
          key={id}
          className={cn(index > 0 && "border-border/60 border-t")}
          data-feature-id={id}
        >
          <HomeGridRow>
            <HomeGridCell className="col-span-2 flex items-start justify-between px-5 py-10 md:col-span-1 md:block lg:py-16">
              <span className="data-stamp text-signal-orange">{number}</span>
              <FeatureIcon icon={Icon} className="md:mt-8" />
            </HomeGridCell>
            <HomeGridCell className="col-span-10 px-6 py-10 sm:px-8 md:col-span-11 lg:p-12 lg:py-16">
              <Badge variant="outline" className="border-signal-orange/30 text-signal-orange">
                {badge}
              </Badge>
              <h3 className="font-display-tight text-foreground mt-5 max-w-3xl text-[30px] sm:text-[38px]">
                {title}
              </h3>
              <p className="text-muted-foreground mt-5 max-w-3xl text-[16px] leading-7">{body}</p>
              <div className="border-border mt-7 flex flex-wrap gap-x-8 gap-y-2 border-t pt-4">
                {tags.map((tag) => (
                  <div key={tag} className="flex items-center gap-3 text-sm">
                    <span className="bg-signal-orange h-1.5 w-1.5 shrink-0" />
                    <span className="text-muted-foreground">{tag}</span>
                  </div>
                ))}
              </div>
            </HomeGridCell>
          </HomeGridRow>
        </article>
      ))}
    </div>
  );
}
