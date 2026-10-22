"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { X, ShieldCheck, Loader2 } from "lucide-react";

interface AcceptanceData {
  terms: { acceptedAt: string; version: string } | null;
  privacy: { acceptedAt: string; version: string } | null;
  currentTermsVersion: string | null;
  currentPrivacyVersion: string | null;
  needsTermsAcceptance: boolean;
  needsPrivacyAcceptance: boolean;
  needsAcceptance: boolean;
}

const DISMISSAL_KEY = "actorconsole.policy-banner-dismissed";

function acceptanceKey(data: AcceptanceData) {
  return `${data.currentTermsVersion ?? "none"}:${data.currentPrivacyVersion ?? "none"}`;
}

export function PolicyAcceptanceBanner() {
  const [data, setData] = useState<AcceptanceData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = API_BASE_URL;

  const loadAcceptance = useCallback(async () => {
    const response = await fetch(`${apiBase}/policies/me/acceptance`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = await response.json();
    return (body?.data ?? null) as AcceptanceData | null;
  }, [apiBase]);

  useEffect(() => {
    loadAcceptance()
      .then((next) => {
        setData(next);
        if (next) {
          setDismissed(sessionStorage.getItem(DISMISSAL_KEY) === acceptanceKey(next));
        }
      })
      .catch(() => setData(null));
  }, [loadAcceptance]);

  const accept = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const acceptPolicy = async (slug: "TERMS" | "PRIVACY", version: string) => {
        const response = await fetch(`${apiBase}/policies/${slug}/accept`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ version }),
        });
        if (!response.ok) throw new Error(`Could not accept ${slug.toLowerCase()} policy`);
      };

      // Both writes update the same User row. Keep them sequential to avoid
      // competing transactions and leaving the banner half-complete.
      if (data.needsTermsAcceptance && data.currentTermsVersion) {
        await acceptPolicy("TERMS", data.currentTermsVersion);
      }
      if (data.needsPrivacyAcceptance && data.currentPrivacyVersion) {
        await acceptPolicy("PRIVACY", data.currentPrivacyVersion);
      }
      sessionStorage.removeItem(DISMISSAL_KEY);
      // Clear immediately, then replace the local state with the authoritative
      // no-store response so a stale browser/CDN response cannot keep the banner visible.
      setData((current) => (current ? { ...current, needsAcceptance: false } : current));
      const refreshed = await loadAcceptance();
      if (refreshed) setData(refreshed);
    } catch {
      setError("We couldn't save your policy choices. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [apiBase, data, loadAcceptance]);

  const dismiss = useCallback(() => {
    if (data) sessionStorage.setItem(DISMISSAL_KEY, acceptanceKey(data));
    setDismissed(true);
  }, [data]);

  if (!data || !data.needsAcceptance || dismissed) return null;

  return (
    <div className="border-signal-orange/30 bg-signal-orange/10 border-b">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:px-6 sm:py-3 lg:px-8">
        <ShieldCheck className="text-signal-orange hidden h-5 w-5 shrink-0 sm:mt-0.5 sm:block" />
        <div className="flex-1 text-sm">
          <p className="text-foreground font-medium">We&apos;ve updated our policies.</p>
          <p className="text-muted-foreground mt-0.5">
            Please review and accept our{" "}
            <Link href="/legal/terms" target="_blank" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" target="_blank" className="underline">
              Privacy Policy
            </Link>{" "}
            to keep using ActorConsole.
          </p>
          {error && (
            <p className="text-destructive mt-2 font-medium" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={accept}
            disabled={saving}
            className="bg-signal-orange hover:bg-signal-orange/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Accept all
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="text-signal-orange hover:bg-signal-orange/10 rounded-md p-1.5"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
