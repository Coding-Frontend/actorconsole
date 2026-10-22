"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import { AuthBrandSteps, AuthFrame } from "@/components/auth/auth-frame";
import { CheckCircle2, ShieldCheck, TimerReset } from "lucide-react";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await fetch("/api/auth/local/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setPending(false);
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch("/api/auth/local/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string };
      if (!result.ok) {
        toast.error(result.error ?? "Unable to reset the password.");
        return;
      }
      toast.success("Password updated. You can now sign in.");
      router.push("/login");
    } catch {
      toast.error("Unable to reset the password.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame
      brand={
        <AuthBrandSteps
          eyebrow="Account recovery"
          title="Get back to the work without losing the thread."
          description="Password recovery keeps your actor portfolio, schedules, and operating history in the same workspace."
          steps={[
            {
              title: "Secure reset",
              description: "A one-time code is sent by ActorConsole.",
              icon: <ShieldCheck className="text-signal-orange h-4 w-4" />,
            },
            {
              title: "Short-lived link",
              description: "Reset links expire so your account stays protected.",
              icon: <TimerReset className="text-signal-orange h-4 w-4" />,
            },
            {
              title: "Back to operations",
              description: "Return to the dashboard as soon as you are ready.",
              icon: <CheckCircle2 className="text-signal-orange h-4 w-4" />,
            },
          ]}
        />
      }
    >
      <div className="space-y-6">
        <div>
          <p className="type-kicker eyebrow-line text-signal-orange">Account recovery</p>
          <h1 className="font-display-tight text-foreground mt-5 text-4xl sm:text-5xl">
            Reset your password.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-sm text-sm leading-6">
            Use the email on your ActorConsole account and we&apos;ll send a secure reset link.
          </p>
        </div>
        <Panel variant="default" radius="none" className="auth-form-panel bg-card/90">
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Reset your password</h1>
              <p className="text-muted-foreground mt-2 text-sm">
                {sent
                  ? "If an account exists for that address, we sent a six-digit reset code."
                  : "Enter your account email and we’ll send a secure reset code."}
              </p>
            </div>
            {!sent && (
              <form onSubmit={submit} className="space-y-4">
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
                  />
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Send reset link
                </Button>
              </form>
            )}
            {sent && (
              <form onSubmit={resetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-code">Reset code</Label>
                  <Input
                    id="reset-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    required
                    minLength={6}
                    maxLength={6}
                    disabled={pending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                    disabled={pending}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <TimerReset className="h-4 w-4" />
                  )}
                  Set new password
                </Button>
              </form>
            )}
          </div>
        </Panel>
        <p className="text-muted-foreground text-center text-sm">
          <Link href="/login" className="text-signal-blue font-medium hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </AuthFrame>
  );
}
