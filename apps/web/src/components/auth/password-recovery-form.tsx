"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Mail, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function recoveryRequest(path: string, input: object, signal: AbortSignal) {
  const response = await fetch(`/api/auth/local/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    throw new Error(
      typeof result?.error === "string"
        ? result.error
        : (result?.error?.message ?? "The request could not be completed. Please try again."),
    );
  }
}

export function PasswordRecoveryForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [stage, setStage] = useState<"email" | "code">("email");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendAfter, setResendAfter] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorPanel = useRef<HTMLParagraphElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (stage === "code") heading.current?.focus();
  }, [stage]);
  useEffect(() => {
    if (error) errorPanel.current?.focus();
  }, [error]);
  useEffect(() => {
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((resendAfter - Date.now()) / 1000)));
    update();
    if (!resendAfter) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [resendAfter]);

  async function perform(path: string, input: object, success: () => void) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    setNotice(null);
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);
    try {
      await recoveryRequest(path, input, controller.signal);
      if (mounted.current && !controller.signal.aborted) success();
    } catch (failure) {
      if (!mounted.current || (controller.signal.aborted && !timedOut)) return;
      setError(
        timedOut
          ? "The request took too long. Please try again."
          : failure instanceof TypeError
            ? "Could not reach the recovery service. Check your connection and try again."
            : failure instanceof Error
              ? failure.message
              : "The request could not be completed. Please try again.",
      );
    } finally {
      window.clearTimeout(timer);
      request.current = null;
      if (mounted.current) setPending(false);
    }
  }

  function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    if (pending || (stage === "code" && Date.now() < resendAfter)) return;
    void perform("forgot-password", { email: email.trim() }, () => {
      setStage("code");
      setCode("");
      setSecondsLeft(60);
      setResendAfter(Date.now() + 60_000);
      setNotice(
        "If this email is registered, check your inbox for a six-digit reset code. Delivery can take a few minutes; check your spam folder too.",
      );
    });
  }

  function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    void perform("reset-password", { email: email.trim(), code: code.trim(), password }, () => {
      setPassword("");
      setCode("");
      router.push("/login?reset=success");
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-muted-foreground">
          {stage === "email" ? "Step 1 of 2" : "Step 2 of 2"}
        </p>
        <h2 ref={heading} tabIndex={-1} className="mt-2 text-xl font-bold tracking-tight">
          {stage === "email" ? "Get a reset code" : "Enter your reset code"}
        </h2>
        <p className="mt-2 break-words text-sm text-muted-foreground">
          {stage === "email"
            ? "Enter your account email to request a six-digit reset code."
            : `Use the code for ${email.trim()} to choose a new password.`}
        </p>
      </div>
      {notice ? (
        <p role="status" className="rounded-md border border-border bg-muted/20 p-3 text-sm">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          ref={errorPanel}
          tabIndex={-1}
          role="alert"
          className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {stage === "email" ? (
        <form onSubmit={sendCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              disabled={pending}
              className="h-12 text-base"
            />
          </div>
          <Button
            type="submit"
            className="h-auto min-h-12 w-full whitespace-normal py-3"
            disabled={pending}
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Mail aria-hidden="true" />
            )}{" "}
            {pending ? "Requesting code…" : "Send reset code"}
          </Button>
        </form>
      ) : (
        <>
          <form onSubmit={resetPassword} className="space-y-4">
            <fieldset disabled={pending} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-code">Reset code</Label>
                <Input
                  id="reset-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  minLength={6}
                  maxLength={6}
                  pattern="[0-9]{6}"
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                    className="h-12 pr-14 text-base"
                    aria-describedby="new-password-help"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide new password" : "Show new password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-1 top-0.5 flex h-11 w-11 items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <Eye aria-hidden="true" className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p id="new-password-help" className="text-xs text-muted-foreground">
                  Use 8–128 characters. You will sign in again after the password is updated.
                </p>
              </div>
              <Button
                type="submit"
                className="h-auto min-h-12 w-full whitespace-normal py-3"
                disabled={pending}
              >
                {pending ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <TimerReset aria-hidden="true" />
                )}{" "}
                {pending ? "Updating password…" : "Set new password"}
              </Button>
            </fieldset>
          </form>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="outline"
              disabled={pending || secondsLeft > 0}
              onClick={() => sendCode()}
              className="h-auto min-h-11 whitespace-normal py-3"
            >
              {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : "Resend code"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setStage("email");
                setCode("");
                setPassword("");
                setError(null);
                setNotice(null);
              }}
              className="min-h-11"
            >
              Change email
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
