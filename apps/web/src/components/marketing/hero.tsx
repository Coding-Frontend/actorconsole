import Link from "next/link";
import { ArrowRight, FileCheck2, Rocket, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeGridSection } from "@/components/marketing/home-grid";
import styles from "./hero.module.css";

const workflow = [
  { number: "01", icon: Search, title: "Find the signal", detail: "Store research" },
  { number: "02", icon: FileCheck2, title: "Review the change", detail: "Listings and pricing" },
  { number: "03", icon: Rocket, title: "Ship with context", detail: "Publishing and costs" },
] as const;

export function Hero() {
  return (
    <HomeGridSection className={styles.hero} frameClassName={styles.frame}>
      <div className={styles.layout}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Built for Apify Actor builders</p>
          <h1 className={styles.headline}>
            Every actor. <span>One clear view.</span>
          </h1>
          <p className={styles.description}>
            Organize Actor workspaces, research Store demand, improve listings, publish
            Actors, and compare usage costs with available revenue data.
          </p>
          <div className={styles.actions}>
            <Button size="lg" asChild>
              <Link href="/signup">
                Start for free
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/features">Explore the platform</Link>
            </Button>
          </div>
        </div>

        <div className={styles.visual} aria-hidden="true">
          <div className={styles.visualCenter}>
            <div className={styles.halo} />
            <div className={styles.workflowPanel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelKicker}>OPERATING SURFACE</p>
                  <p className={styles.panelTitle}>From signal to ship</p>
                </div>
                <span className={styles.liveStatus}>
                  <span className={styles.liveDot} />
                  IN MOTION
                </span>
              </div>

              <div className={styles.steps}>
                {workflow.map(({ number, icon: Icon, title, detail }) => (
                  <div className={styles.step} key={number}>
                    <span className={styles.stepNode}>
                      <Icon size={17} strokeWidth={1.8} />
                    </span>
                    <span className={styles.stepText}>
                      <span className={styles.stepTitle}>{title}</span>
                      <span className={styles.stepDetail}>{detail}</span>
                    </span>
                    <span className={styles.stepNumber}>{number}</span>
                  </div>
                ))}
              </div>

              <div className={styles.panelFooter}>
                <span>RESEARCH</span>
                <span className={styles.footerRule} />
                <span>REVIEW</span>
                <span className={styles.footerRule} />
                <span>SHIP</span>
              </div>
            </div>
          </div>

          <div className={styles.visualBottomline}>
            <span>ONE CONTINUOUS WORKFLOW</span>
            <span>BUILD / REVIEW / RELEASE</span>
          </div>
        </div>
      </div>
    </HomeGridSection>
  );
}
