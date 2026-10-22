"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";

const STORAGE_KEY = "actorconsole.cookie-consent";
export const CONSENT_CHANGE_EVENT = "actorconsole:consent-changed";
/**
 * Versioned consent schema. Bump the version when categories change
 * so users are re-prompted and old decisions don't carry over.
 */
const CONSENT_VERSION = 1;

export type ConsentChoice = "all" | "essential" | "rejected";

export interface ConsentRecord {
  version: number;
  choice: ConsentChoice;
  timestamp: number;
}

/**
 * Reads the stored consent record. Returns null when absent or
 * out-of-date (older version).
 */
function readConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeConsent(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    choice,
    timestamp: Date.now(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    // Also write a non-tracking cookie so server-side code can read it.
    // 365 days; SameSite=Lax; secure in production.
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `actorconsole-consent=${choice}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // localStorage may be disabled (private mode). Consent is
    // still recorded in-memory for the session.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT));
}

export function CookieConsent() {
  // Default to "loading" so the banner doesn't flash on first render.
  // On the server we render nothing; on the client we read the
  // stored choice and decide.
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const existing = readConsent();
    if (!existing) setShow(true);
  }, []);

  if (!show) return null;

  function accept(category: ConsentChoice) {
    writeConsent(category);
    setShow(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-modal="false"
      className="border-border/70 bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-50 border-t shadow-lg backdrop-blur"
    >
      <div className="scroll-soft mx-auto max-h-[min(52vh,24rem)] max-w-5xl overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex items-start gap-3">
            <div className="bg-brand-500/10 text-brand-500 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:flex">
              <Cookie className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-foreground text-sm font-semibold">We use cookies</p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed sm:text-sm">
                Essential cookies keep you signed in. Optional product analytics are only enabled
                after you choose them; we do not use advertising or retargeting trackers.{" "}
                <button
                  type="button"
                  className="hover:text-foreground underline underline-offset-2"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? "Hide details" : "Show details"}
                </button>
              </p>
              {expanded && (
                <ul className="text-muted-foreground mt-3 space-y-2 text-xs">
                  <li>
                    <span className="text-foreground font-medium">Essential:</span> Required for the
                    sign-in session (Auth.js) and CSRF protection. Always on.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Analytics:</span> Optional
                    first-party product measurement. No analytics provider is loaded until an
                    analytics integration is configured and you opt in.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Marketing:</span> Not used. We
                    don&apos;t run ad networks or retargeting pixels.
                  </li>
                </ul>
              )}
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => accept("essential")}
            >
              Essential only
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => accept("all")}
            >
              Accept all
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Programmatic accessor for the consent record. Components that load optional
 * analytics should call this and only mount after the user has opted into "all".
 */
export function getConsent(): ConsentChoice | null {
  return readConsent()?.choice ?? null;
}

/**
 * Revoke consent. Useful for a "Reset" button in /settings.
 */
export function clearConsent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } finally {
    document.cookie = "actorconsole-consent=; Max-Age=0; Path=/";
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT));
  }
}
