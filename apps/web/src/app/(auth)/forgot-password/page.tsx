import Link from "next/link";
import { CheckCircle2, ShieldCheck, TimerReset } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { AuthBrandSteps, AuthFrame } from "@/components/auth/auth-frame";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";

export default function ForgotPasswordPage() {
  return (
    <AuthFrame
      brand={
        <AuthBrandSteps
          eyebrow="Account recovery"
          title="Get back to your workspace."
          description="Recover access to your Actor portfolio, schedules, and operating history."
          steps={[
            {
              title: "Request a code",
              description: "Use the email on your ActorConsole account.",
              icon: <ShieldCheck aria-hidden="true" className="h-4 w-4 text-signal-orange" />,
            },
            {
              title: "Enter the reset code",
              description: "Use the six-digit code from your email.",
              icon: <TimerReset aria-hidden="true" className="h-4 w-4 text-signal-orange" />,
            },
            {
              title: "Sign in again",
              description: "Continue with your new password.",
              icon: <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-signal-orange" />,
            },
          ]}
        />
      }
    >
      <div className="space-y-6">
        <div>
          <p className="type-kicker eyebrow-line text-signal-orange">Account recovery</p>
          <h1 className="font-display-tight mt-5 text-4xl text-foreground sm:text-5xl">
            Reset your password.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
            Request a reset code, then choose a new password.
          </p>
        </div>
        <Panel variant="default" radius="none" className="auth-form-panel bg-card/90">
          <PasswordRecoveryForm />
        </Panel>
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center font-medium text-signal-blue hover:underline"
          >
            Back to login
          </Link>
        </p>
      </div>
    </AuthFrame>
  );
}
