"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail } from "lucide-react";
import { safeCallbackUrl } from "@/lib/safe-callback-url";
import { notifySessionChanged } from "@/lib/session-events";

interface EmailPasswordFormProps {
  mode: "login" | "signup";
  callbackUrl?: string;
  termsAccepted?: boolean;
  termsCheckbox?: ReactNode;
}

export function EmailPasswordForm({
  mode,
  callbackUrl = "/dashboard",
  termsAccepted = true,
  termsCheckbox,
}: EmailPasswordFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useEffect(() => { if (twoFactorChallenge) codeInput.current?.focus(); }, [twoFactorChallenge]);

  function reportError(message: string) {
    setError(message);
    toast.error(message);
  }

  async function completeSession(input: { totpCode?: string; challengeToken?: string } = {}) {
    const response = await fetch("/api/auth/local/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, ...input }),
    });
    const result = (await response.json()) as {
      ok: boolean;
      error?: string;
      code?: string;
      requiresTwoFactor?: boolean;
      challengeToken?: string;
    };
    if (!result.ok) {
      reportError(result.error ?? "Failed to sign in. Please try again.");
      if (result.code === "EMAIL_UNVERIFIED") {
        router.push(
          `/signup/verify-email?email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent(safeCallbackUrl(callbackUrl))}`,
        );
      }
      return false;
    }
    if (result.requiresTwoFactor && result.challengeToken) {
      setTwoFactorChallenge(result.challengeToken);
      toast.message("Enter the verification code from your authenticator app.");
      return false;
    }
    notifySessionChanged();
    router.push(safeCallbackUrl(callbackUrl));
    router.refresh();
    return true;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    if (twoFactorChallenge) {
      await verifyTwoFactor();
      return;
    }

    if (mode === "signup" && !termsAccepted) {
      toast.error("Please accept the Terms of Service and Privacy Policy first.");
      return;
    }

    if (!email || !password) {
      toast.error("Please fill in all fields.");
      return;
    }

    if (mode === "signup" && password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    pending.current = true;
    setIsPending(true);
    setError(null);
    try {
      if (mode === "signup") {
        const response = await fetch("/api/auth/local/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, termsAccepted }),
        });
        const result = (await response.json()) as { ok: boolean; error?: string };
        if (!result.ok) {
          reportError(result.error ?? "Unable to create the account.");
          return;
        }
        toast.success("Account created. Check your email for the verification code.");
        router.push(
          `/signup/verify-email?email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent(safeCallbackUrl(callbackUrl))}`,
        );
      } else {
        await completeSession();
      }
    } catch (err) {
      reportError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      pending.current = false;
      setIsPending(false);
    }
  }

  async function verifyTwoFactor() {
    if (pending.current || !twoFactorChallenge || !twoFactorCode.trim()) return;
    pending.current = true;
    setIsPending(true);
    setError(null);
    try {
      await completeSession({
        totpCode: twoFactorCode.trim(),
        challengeToken: twoFactorChallenge,
      });
    } catch (err) {
      reportError(err instanceof Error ? err.message : "Verification failed. Please try again.");
    } finally {
      pending.current = false;
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {twoFactorChallenge ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="totp-code">Authenticator code</Label>
            <p className="text-muted-foreground mt-1 text-xs">
              Enter the six-digit code from your authenticator app, or one unused recovery code.
            </p>
          </div>
          <Input
            ref={codeInput}
            id="totp-code"
            inputMode="text"
            autoComplete="one-time-code"
            placeholder="123456"
            value={twoFactorCode}
            onChange={(e) => setTwoFactorCode(e.target.value)}
            disabled={isPending}
            aria-describedby={error ? errorId : undefined}
          />
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isPending || !twoFactorCode.trim()}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Verify and continue
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {mode === "login" && (
                <Link
                  href="/forgot-password"
                  className="text-signal-blue text-xs font-medium hover:underline"
                >
                  Forgot password?
                </Link>
              )}
            </div>
            <Input
              id="password"
              type="password"
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
            />
          </div>
          {mode === "signup" && termsCheckbox ? <div className="pt-1">{termsCheckbox}</div> : null}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isPending || (mode === "signup" && !termsAccepted)}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            {mode === "login" ? "Sign in with email" : "Create account"}
          </Button>
        </>
      )}
      {error ? <p id={errorId} role="alert" className="text-destructive text-sm">{error}</p> : null}
    </form>
  );
}
