"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { safeCallbackUrl } from "@/lib/safe-callback-url";
import { useRouter } from "next/navigation";
import { CheckCircle2, Inbox, Loader2, MailCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AuthBrandSteps, AuthFrame } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [callbackUrl, setCallbackUrl] = useState("/dashboard");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get("email") ?? "");
    setCallbackUrl(safeCallbackUrl(params.get("callbackUrl")));
  }, []);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch("/api/auth/local/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string };
      if (!result.ok) {
        toast.error(result.error ?? "Unable to verify the email.");
        return;
      }
      setVerified(true);
      setTimeout(() => {
        router.push(callbackUrl);
        router.refresh();
      }, 800);
    } catch {
      toast.error("Unable to verify the email.");
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    setPending(true);
    try {
      const response = await fetch("/api/auth/local/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string };
      if (result.ok) toast.success("A new verification code was sent.");
      else toast.error(result.error ?? "Unable to send a new code.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame
      brand={
        <AuthBrandSteps
          eyebrow="Verify your email"
          title="One small step before the workspace opens."
          description="Confirm the address you use for ActorConsole so every sign-in method reaches the same workspace."
          steps={[
            {
              title: "Check your inbox",
              description: "Find the six-digit ActorConsole code.",
              icon: <Inbox className="text-signal-orange h-4 w-4" />,
            },
            {
              title: "Enter the code",
              description: "The code is valid for ten minutes.",
              icon: <MailCheck className="text-signal-orange h-4 w-4" />,
            },
            {
              title: "Continue",
              description: "Open the same account with password or social login.",
              icon: <RefreshCw className="text-signal-orange h-4 w-4" />,
            },
          ]}
        />
      }
    >
      <div className="space-y-6">
        <div>
          <p className="type-kicker eyebrow-line text-signal-orange">Verify your email</p>
          <h1 className="font-display-tight text-foreground mt-5 text-4xl sm:text-5xl">
            Open the workspace securely.
          </h1>
        </div>
        <Panel variant="default" radius="none" className="auth-form-panel bg-card/90">
          {verified ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="text-signal-green mx-auto h-10 w-10" />
              <h2 className="text-xl font-bold">Email verified</h2>
              <p className="text-muted-foreground text-sm">Redirecting to your account…</p>
            </div>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verification-email">Email</Label>
                <Input
                  id="verification-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={pending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="verification-code">Verification code</Label>
                <Input
                  id="verification-code"
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
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MailCheck className="h-4 w-4" />
                )}
                Verify and continue
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={pending || !email}
                onClick={() => void resend()}
              >
                Send a new code
              </Button>
            </form>
          )}
        </Panel>
        <p className="text-muted-foreground text-center text-sm">
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="text-signal-blue font-medium hover:underline"
          >
            Back to login
          </Link>
        </p>
      </div>
    </AuthFrame>
  );
}
