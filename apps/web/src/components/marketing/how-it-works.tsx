"use client";

import { useState } from "react";
import { ArrowRight, Link2, Rocket, Sparkles } from "lucide-react";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";

const steps = [
  {
    icon: Link2,
    step: "01",
    title: "Connect your Apify account",
    body: "Create or select a workspace, connect your Apify account, and sync the Actors it owns.",
    detail: "Your account stays in control. Nothing is published until you choose the next move.",
  },
  {
    icon: Sparkles,
    step: "02",
    title: "Optimize with AI",
    body: "Generate reviewed titles, descriptions, and pricing suggestions from Actor listing context. Apify manages Store categories automatically.",
    detail:
      "Every suggestion stays reviewable: compare the current Store listing with a proposed change before applying it.",
  },
  {
    icon: Rocket,
    step: "03",
    title: "Operate and review",
    body: "Schedule Actor publishing, check readiness, and compare costs with available creator revenue.",
    detail: "Review publishing results in the dashboard.",
  },
];

export function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);
  const active = steps[activeStep];
  const ActiveIcon = active.icon;

  return (
    <HomeGridSection className="bg-fog/35">
      <HomeGridRow className="home-grid-intro-row">
        <HomeGridCell className="col-span-5 px-6 py-14 sm:px-8 sm:py-16 lg:p-12">
          <p className="home-grid-kicker">A simple loop</p>
          <h2 className="font-display-tight text-foreground mt-5 max-w-sm text-[40px] sm:text-[52px]">
            From loose idea to shipped actor.
          </h2>
        </HomeGridCell>
        <HomeGridCell className="col-span-7 flex flex-col justify-end px-6 py-14 sm:px-8 sm:py-16 lg:p-12">
          <p className="text-muted-foreground mt-5 max-w-sm text-base leading-7">
            The workflow stays explicit. You decide what changes; ActorConsole keeps the work
            visible and repeatable.
          </p>
          <div className="border-border mt-8 max-w-lg border-l pl-4">
            <p className="data-stamp text-muted-foreground">ONE ACTIVE THREAD</p>
            <p className="text-foreground mt-2 text-sm leading-6">
              Research, create, publish, and learn without losing the handoff between each stage.
            </p>
          </div>
        </HomeGridCell>
      </HomeGridRow>

      <HomeGridRow>
        <HomeGridCell className="col-span-4 px-6 py-10 sm:px-8 lg:p-10">
          <div className="border-border border-t" aria-label="Workflow steps">
            {steps.map(({ icon: Icon, step, title }, index) => {
              const isActive = activeStep === index;
              return (
                <button
                  key={step}
                  type="button"
                  aria-expanded={isActive}
                  aria-controls={`workflow-panel-${step}`}
                  onClick={() => setActiveStep(index)}
                  className={`border-border group flex w-full items-start gap-4 border-b py-5 text-left transition-colors ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <span
                    className={`data-stamp pt-1 ${isActive ? "text-signal-orange" : "text-muted-foreground"}`}
                  >
                    {step}
                  </span>
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center border transition-colors ${isActive ? "border-signal-orange/45 bg-signal-orange/10 text-signal-orange" : "border-border bg-card text-muted-foreground group-hover:border-signal-orange/35"}`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-display-tight block text-[21px] leading-tight">
                      {title}
                    </span>
                    <span
                      className={`mt-2 block text-[10px] uppercase tracking-[0.12em] ${isActive ? "text-signal-orange" : "text-muted-foreground"}`}
                    >
                      {isActive ? "Selected" : "Open step"}
                    </span>
                  </span>
                  <ArrowRight
                    className={`mt-1 h-4 w-4 shrink-0 transition-transform ${isActive ? "text-signal-orange translate-x-1" : "opacity-0 group-hover:opacity-100"}`}
                  />
                </button>
              );
            })}
          </div>
        </HomeGridCell>

        <HomeGridCell className="bg-card/35 col-span-8 px-6 py-10 sm:px-8 lg:p-10">
          <div
            id={`workflow-panel-${active.step}`}
            role="region"
            aria-live="polite"
            aria-labelledby={`workflow-title-${active.step}`}
            className="border-border bg-card border p-5 sm:p-7"
          >
            <div className="border-border flex items-start justify-between gap-4 border-b pb-5">
              <div className="flex items-start gap-3">
                <div className="border-signal-blue/35 bg-signal-blue/10 text-signal-blue flex h-10 w-10 shrink-0 items-center justify-center border">
                  <ActiveIcon className="h-4 w-4" />
                </div>
                <div>
                  <p className="data-stamp text-signal-orange">{active.step} / WORKFLOW STEP</p>
                  <h3
                    id={`workflow-title-${active.step}`}
                    className="font-display-tight text-foreground mt-2 text-[28px] sm:text-[34px]"
                  >
                    {active.title}
                  </h3>
                </div>
              </div>
            </div>
            <p className="text-muted-foreground mt-5 max-w-xl text-[15px] leading-7">
              {active.body}
            </p>
            <div className="border-border text-muted-foreground mt-7 border-t pt-4 text-sm leading-6">
              {active.detail}
            </div>
          </div>
        </HomeGridCell>
      </HomeGridRow>
    </HomeGridSection>
  );
}
