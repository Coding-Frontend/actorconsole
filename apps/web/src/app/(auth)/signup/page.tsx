"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { safeCallbackUrl } from "@/lib/safe-callback-url";
import { CheckCircle2, TrendingUp, Shield } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Separator } from "@/components/ui/separator";
import { SocialButtons } from "@/components/auth/social-buttons";
import { EmailPasswordForm } from "@/components/auth/email-password-form";
import { TermsCheckbox } from "@/components/auth/terms-checkbox";
import { AuthBrandSteps, AuthFrame } from "@/components/auth/auth-frame";

export default function SignupPage() {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("/dashboard");
  useEffect(() => {
    setCallbackUrl(safeCallbackUrl(new URLSearchParams(window.location.search).get("callbackUrl")));
  }, []);

  return (
    <AuthFrame
      brand={
        <AuthBrandSteps
          eyebrow="A better operating rhythm"
          title="Manage and improve your Apify actors from one workspace."
          description="Join Apify developers using ActorConsole to optimize Store listings, automate schedules, and inspect usage costs."
          steps={[
            {
              title: "Store optimization",
              description: "Draft copy and research relevant listing keywords.",
              icon: <TrendingUp className="text-signal-orange h-4 w-4" />,
            },
            {
              title: "Automated publishing",
              description: "Run recurring publishing, rewrites, and usage checks.",
              icon: <CheckCircle2 className="text-signal-orange h-4 w-4" />,
            },
            {
              title: "Usage visibility",
              description: "Keep actor activity and operating costs easy to understand.",
              icon: <Shield className="text-signal-orange h-4 w-4" />,
            },
          ]}
        />
      }
    >
      <div className="space-y-7">
        <div>
          <p className="type-kicker eyebrow-line text-signal-orange">Start with the essentials</p>
          <h1 className="font-display-tight text-foreground mt-5 text-4xl sm:text-5xl">
            Build a steadier actor operation.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-sm text-sm leading-6">
            Create a free workspace and bring your listings, code, schedules, and costs into one
            view.
          </p>
        </div>

        <Panel variant="default" radius="none" className="auth-form-panel bg-card/90">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Create your free account</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Up to 50 actors and 500 monthly users free. No credit card required.
              </p>
            </div>

            <EmailPasswordForm
              mode="signup"
              callbackUrl={callbackUrl}
              termsAccepted={termsAccepted}
              termsCheckbox={
                <TermsCheckbox termsAccepted={termsAccepted} onChange={setTermsAccepted} />
              }
            />

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background text-muted-foreground px-2">Or continue with</span>
              </div>
            </div>

            <SocialButtons callbackUrl={callbackUrl} />
          </div>
        </Panel>

        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{" "}
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="text-signal-blue font-medium hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </AuthFrame>
  );
}
