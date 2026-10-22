import Link from "next/link";
import { BarChart3, CheckCircle2, Database } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Separator } from "@/components/ui/separator";
import { SocialButtons } from "@/components/auth/social-buttons";
import { EmailPasswordForm } from "@/components/auth/email-password-form";
import { AuthBrandSteps, AuthFrame } from "@/components/auth/auth-frame";
import { safeCallbackUrl } from "@/lib/safe-callback-url";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);

  return (
    <AuthFrame
      brand={
        <AuthBrandSteps
          eyebrow="ActorConsole account"
          title="Your operating layer is ready when you are."
          description="Sign in to manage your Actor portfolio, publishing schedule, and operating costs from one calm workspace."
          steps={[
            {
              title: "Apify",
              description: "Actor sync",
              icon: <Database className="text-signal-orange h-4 w-4" />,
            },
            {
              title: "Insights",
              description: "Usage and cost signals",
              icon: <BarChart3 className="text-signal-orange h-4 w-4" />,
            },
            {
              title: "MCP",
              description: "Agent access",
              icon: <CheckCircle2 className="text-signal-orange h-4 w-4" />,
            },
          ]}
        />
      }
    >
      <div className="space-y-7">
        <div>
          <p className="type-kicker eyebrow-line text-signal-orange">ActorConsole account</p>
          <h1 className="font-display-tight text-foreground mt-5 text-4xl sm:text-5xl">
            Pick up where you left off.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-sm text-sm leading-6">
            Sign in to manage your Actor portfolio, publishing schedule, and operating costs from
            one calm workspace.
          </p>
        </div>

        <Panel variant="default" radius="none" className="auth-form-panel bg-card/90">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Welcome back</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Sign in to manage your Apify actors.
              </p>
            </div>

            {params.error && (
              <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
                {params.error === "CredentialsSignin"
                  ? "Invalid credentials. Please try again."
                  : params.error}
              </div>
            )}

            <EmailPasswordForm mode="login" callbackUrl={callbackUrl} />

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
          Don&apos;t have an account?{" "}
          <Link
            href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="text-signal-blue font-medium hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </AuthFrame>
  );
}
