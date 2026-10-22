"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CircleHelp,
  Cookie,
  ExternalLink,
  KeyRound,
  Puzzle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChromeExtensionLink } from "@/components/chrome-extension-link";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const integrationsUrl = "https://console.apify.com/settings/integrations";

const steps = [
  { label: "API key", title: "Add an API key", icon: KeyRound },
  { label: "Browser session", title: "Connect your browser session", icon: Puzzle },
  { label: "Manual option", title: "Connect without the extension", icon: Cookie },
] as const;

export function ApifyConnectionGuide() {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const Icon = current.icon;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) setStep(0);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <CircleHelp />
          How to connect Apify
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl gap-0 p-0 sm:p-0">
        <div className="border-border border-b px-5 pb-5 pt-6 sm:px-7 sm:pt-7">
          <DialogHeader>
            <DialogTitle>Connect Apify to this workspace</DialogTitle>
            <DialogDescription>
              An API key enables Actor operations. A browser session adds Console data.
            </DialogDescription>
          </DialogHeader>
          <nav aria-label="Connection guide steps" className="mt-6 grid grid-cols-3 gap-1.5">
            {steps.map((item, index) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setStep(index)}
                aria-current={step === index ? "step" : undefined}
                className={
                  "focus-visible:ring-ring rounded-sm border px-2 py-2 text-left text-xs leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 " +
                  (step === index
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground")
                }
              >
                <span className="mr-1.5 font-semibold tabular-nums">{index + 1}.</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="min-h-72 px-5 py-6 sm:px-7" aria-live="polite">
          <div className="flex items-start gap-3">
            <span className="border-border bg-muted/30 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">
                Step {step + 1} of {steps.length}
                {step === 2 ? " · alternative" : ""}
              </p>
              <h3 className="font-display-tight mt-1 text-lg font-medium">{current.title}</h3>
            </div>
          </div>

          {step === 0 ? (
            <div className="mt-5 space-y-4 text-sm leading-6">
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Open{" "}
                  <a
                    href={integrationsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-signal-blue inline-flex items-center gap-1 underline-offset-4 hover:underline"
                  >
                    Apify Settings → API &amp; Integrations <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  .
                </li>
                <li>Create or copy a key with access to the Actors in this workspace.</li>
                <li>
                  Open this workspace&apos;s{" "}
                  <Link href="/dashboard/apify" className="text-signal-blue underline">
                    Apify connection page
                  </Link>
                  , paste it into the API key field, and save the connection.
                </li>
              </ol>
              <p className="text-muted-foreground border-border border-t pt-4 text-xs leading-5">
                Actor sync, builds, runs, schedules, publication, and API reporting need this key. A
                limited key may connect but still lack access to those operations.
              </p>
            </div>
          ) : step === 1 ? (
            <div className="mt-5 space-y-4 text-sm leading-6">
              <ChromeExtensionLink />
              <ol className="list-decimal space-y-2 pl-5">
                <li>Install the ActorConsole Apify Connector from the Chrome Web Store.</li>
                <li>
                  Open its sidebar, choose <strong>Sign in with ActorConsole</strong>, and select{" "}
                  <strong>Authorize browser</strong> on the page that opens.
                </li>
                <li>Sign in to Apify Console in Chrome and reload it.</li>
                <li>
                  Choose a workspace and Apify account in the sidebar, then connect and approve
                  cookie access.
                </li>
              </ol>
              <p className="text-muted-foreground border-border border-t pt-4 text-xs leading-5">
                The extension checks both Console domains. Only the backend ApifyRT cookie is sent
                to this workspace for Console access.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-4 text-sm leading-6">
              <p className="text-muted-foreground">
                Use this option if you cannot connect with the extension.
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  On the Apify connection page, open Console operations if needed, then select{" "}
                  <strong>Resume cURL</strong> under Manual Console connection.
                </li>
                <li>
                  In Apify Console, open DevTools → Network, reload the page, and copy as cURL the
                  request to{" "}
                  <code className="break-all text-xs">
                    console-backend.apify.com/public/authentication/resume
                  </code>
                  .
                </li>
                <li>
                  Paste it into the Manual Console connection field on the Apify connection page and
                  save.
                </li>
              </ol>
              <p className="text-muted-foreground border-border border-t pt-4 text-xs leading-5">
                For cookie exports, provide both Console domains. The ApifyRT cookie must come from
                console-backend.apify.com. Reconnect when the session expires.
              </p>
            </div>
          )}
        </div>

        <div className="border-border bg-muted/15 border-t px-5 py-4 sm:px-7">
          <p className="text-muted-foreground mb-4 flex items-start gap-2 text-xs leading-5">
            <ShieldCheck className="text-signal-green mt-0.5 h-4 w-4 shrink-0" />
            Treat keys and cookies like passwords. Keep them out of chat, tickets, source control,
            and screenshots.
          </p>
          <DialogFooter>
            {step > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                <ArrowLeft /> Back
              </Button>
            ) : null}
            {step < steps.length - 1 ? (
              <Button type="button" size="sm" onClick={() => setStep(step + 1)}>
                {step === 1 ? "Manual alternative" : "Next"} <ArrowRight />
              </Button>
            ) : (
              <DialogClose asChild>
                <Button type="button" size="sm">
                  Done
                </Button>
              </DialogClose>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
