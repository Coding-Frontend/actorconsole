import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type AuthFrameProps = {
  children: ReactNode;
  brand: ReactNode;
  formSide?: "left" | "right";
  className?: string;
};

/**
 * Shared desktop frame for every auth flow. Keeping the form column and the
 * brand column here prevents login, signup, and recovery screens from
 * drifting into different page patterns.
 */
export function AuthFrame({ children, brand, formSide = "right", className }: AuthFrameProps) {
  const formOnLeft = formSide === "left";

  return (
    <div
      className={cn(
        "home-grid-section relative flex min-h-[calc(100dvh-4rem)] w-full flex-1",
        className,
      )}
    >
      <div className="home-grid-frame bg-background relative grid flex-1 lg:grid-cols-2">
        <section
          className={cn(
            "flex min-h-full min-w-0 items-center justify-center px-6 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20",
            formOnLeft ? "order-1 lg:border-r" : "order-2",
          )}
        >
          <div className="w-full max-w-md">{children}</div>
        </section>

        <aside
          className={cn(
            "semantic-accent-panel relative hidden min-h-full min-w-0 overflow-hidden lg:flex",
            formOnLeft ? "order-2" : "order-1 border-r",
          )}
        >
          <span className="blueprint-crosshair right-10 top-10" aria-hidden="true" />
          <div className="text-foreground relative flex h-full min-h-[640px] w-full max-w-xl flex-col justify-center p-12 xl:p-16">
            {brand}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function AuthBrandSteps({
  eyebrow,
  title,
  description,
  steps,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  steps: Array<{ title: string; description: string; icon: ReactNode }>;
}) {
  return (
    <>
      <p className="type-kicker text-signal-orange">{eyebrow}</p>
      <h2 className="font-display-tight mt-6 max-w-xl text-4xl leading-[0.98] sm:text-5xl">
        {title}
      </h2>
      <p className="text-muted-foreground mt-5 max-w-md text-base leading-7">{description}</p>

      <div className="border-border mt-12 space-y-5 border-t pt-8">
        {steps.map((step) => (
          <div key={step.title} className="flex items-start gap-3">
            <div className="border-border bg-card/70 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border">
              {step.icon}
            </div>
            <div>
              <p className="font-semibold">{step.title}</p>
              <p className="text-muted-foreground mt-0.5 text-sm">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Loading frame for auth routes. It mirrors AuthFrame's form/brand split so
 * navigation never collapses into a centered card while the page resolves.
 */
export function AuthLoadingFrame({
  children,
  formSide = "right",
}: {
  children: ReactNode;
  formSide?: "left" | "right";
}) {
  const formOnLeft = formSide === "left";

  return (
    <div className="home-grid-section relative flex min-h-[calc(100dvh-4rem)] w-full flex-1">
      <div className="home-grid-frame bg-background relative grid flex-1 lg:grid-cols-2">
        <section
          className={cn(
            "flex min-h-full min-w-0 items-center justify-center px-6 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20",
            formOnLeft ? "order-1 lg:border-r" : "order-2",
          )}
        >
          <div className="w-full max-w-md">{children}</div>
        </section>

        <aside
          className={cn(
            "semantic-accent-panel relative hidden min-h-full min-w-0 overflow-hidden lg:flex",
            formOnLeft ? "order-2" : "order-1 border-r",
          )}
        >
          <span className="blueprint-crosshair right-10 top-10" aria-hidden="true" />
          <div className="relative flex h-full min-h-[640px] w-full max-w-xl flex-col justify-center p-12 xl:p-16">
            <Skeleton className="bg-foreground/10 h-3 w-40" />
            <Skeleton className="bg-foreground/10 mt-6 h-14 w-full max-w-lg" />
            <Skeleton className="bg-foreground/10 mt-2 h-14 w-[72%] max-w-md" />
            <Skeleton className="bg-foreground/10 mt-6 h-4 w-full max-w-md" />
            <Skeleton className="bg-foreground/10 mt-2 h-4 w-[84%] max-w-sm" />
            <div className="border-border mt-12 space-y-5 border-t pt-8">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Skeleton className="bg-foreground/10 mt-0.5 h-8 w-8 shrink-0 rounded-sm" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="bg-foreground/10 h-3.5 w-32" />
                    <Skeleton className="bg-foreground/10 h-3 w-full max-w-sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
