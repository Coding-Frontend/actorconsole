"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Github, Loader2, ShieldCheck } from "lucide-react";
import {
  signInWithGitHub,
  signInWithGoogle,
  exchangeFirebaseToken,
  type FirebaseUser,
} from "@/lib/firebase";
import { safeCallbackUrl } from "@/lib/safe-callback-url";
import { notifySessionChanged } from "@/lib/session-events";
import { trackEvent } from "@/lib/analytics-events";

/** Firebase occasionally leaves a closed popup's promise pending. */
function waitForSocialPopup<T>(openPopup: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let popupTookFocus = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;

    function cleanup() {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      if (focusTimer) clearTimeout(focusTimer);
    }

    function handleBlur() {
      popupTookFocus = true;
    }

    function handleFocus() {
      if (!popupTookFocus) return;
      // Give Firebase time to return a successful credential or its own
      // popup-closed error before treating a return to this tab as cancellation.
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        cleanup();
        reject({ code: "auth/popup-closed-by-user" });
      }, 2000);
    }

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    try {
      // Open within the click's user activation so the browser allows the popup.
      openPopup().then(
        (result) => {
          cleanup();
          resolve(result);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export function SocialButtons({ callbackUrl = "/dashboard" }: { callbackUrl?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"google" | "github" | "verify" | null>(null);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const loginMethod = useRef<"google" | "github">("google");

  async function completeSession(
    input: { totpCode?: string; challengeToken?: string } = {},
    firebaseUser?: FirebaseUser,
  ) {
    const result = await exchangeFirebaseToken(input, firebaseUser);
    if (!result.ok) {
      toast.error(result.error ?? "Failed to sign in. Please try again.");
      return;
    }
    if (result.requiresTwoFactor && result.challengeToken) {
      setTwoFactorChallenge(result.challengeToken);
      toast.message("Enter the verification code from your authenticator app.");
      return;
    }
    notifySessionChanged();
    void trackEvent("login", { method: loginMethod.current });
    router.push(safeCallbackUrl(callbackUrl));
    router.refresh();
  }

  async function handleGoogleLogin() {
    loginMethod.current = "google";
    setLoading("google");
    try {
      const credential = await waitForSocialPopup(signInWithGoogle);

      // Exchange Firebase token for Auth.js session (or begin the TOTP step).
      await completeSession({}, credential.user);
    } catch (err: any) {
      // User cancelled popup
      if (err?.code === "auth/popup-closed-by-user") return;
      if (err?.code === "auth/configuration-not-found") {
        toast.error("Social sign-in is not configured yet. Please contact the administrator.");
        return;
      }
      toast.error(err?.message ?? "Failed to sign in with Google. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function handleGitHubLogin() {
    loginMethod.current = "github";
    setLoading("github");
    try {
      const credential = await waitForSocialPopup(signInWithGitHub);
      await completeSession({}, credential.user);
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user") return;
      if (err?.code === "auth/account-exists-with-different-credential") {
        toast.error("This email already uses another social provider. Sign in with it first.");
        return;
      }
      if (err?.code === "auth/operation-not-allowed") {
        toast.error("GitHub sign-in has not been enabled in Firebase yet.");
        return;
      }
      toast.error(err?.message ?? "Failed to sign in with GitHub. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function verifyTwoFactor() {
    if (!twoFactorChallenge || !twoFactorCode.trim()) return;
    setLoading("verify");
    try {
      await completeSession({
        totpCode: twoFactorCode.trim(),
        challengeToken: twoFactorChallenge,
      });
    } finally {
      setLoading(null);
    }
  }

  if (twoFactorChallenge) {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Two-factor verification</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Enter your authenticator code or an unused recovery code.
          </p>
        </div>
        <input
          aria-label="Authenticator code"
          inputMode="text"
          autoComplete="one-time-code"
          className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
          placeholder="123456"
          value={twoFactorCode}
          onChange={(e) => setTwoFactorCode(e.target.value)}
          disabled={loading !== null}
        />
        <Button
          type="button"
          className="w-full"
          size="lg"
          disabled={loading !== null || !twoFactorCode.trim()}
          onClick={() => void verifyTwoFactor()}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Verify and continue
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        size="lg"
        disabled={loading !== null}
        onClick={() => void handleGoogleLogin()}
      >
        {loading === "google" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.87-2.6-2.43-4.53-6.19-4.53z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        )}
        Continue with Google
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        size="lg"
        disabled={loading !== null}
        onClick={() => void handleGitHubLogin()}
      >
        {loading === "github" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Github className="h-4 w-4" />
        )}
        Continue with GitHub
      </Button>
    </div>
  );
}
