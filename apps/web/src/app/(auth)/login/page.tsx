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
  searchParams: Promise<{ callbackUrl?: string; error?: string; reset?: string }>;
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
              icon: <Database className="h-4 w-4 text-signal-orange" />,
            },
            {
              title: "Insights",
              description: "Usage and cost signals",
              icon: <BarChart3 className="h-4 w-4 text-signal-orange" />,
            },
            {
              title: "MCP",
              description: "Agent access",
              icon: <CheckCircle2 className="h-4 w-4 text-signal-orange" />,
            },
          ]}
        />
      }
    >
      <div className="space-y-7">
        <div>
          <p className="type-kicker eyebrow-line text-signal-orange">ActorConsole account</p>
          <h1 className="font-display-tight mt-5 text-4xl text-foreground sm:text-5xl">
            Pick up where you left off.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
            Sign in to manage your Actor portfolio, publishing schedule, and operating costs from
            one calm workspace.
          </p>
        </div>

        <Panel variant="default" radius="none" className="auth-form-panel bg-card/90">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Welcome back</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in to manage your Apify actors.
              </p>
            </div>

            {params.reset === "success" ? (
              <p
                role="status"
                className="border-signal-green/30 bg-signal-green/5 rounded-md border p-3 text-sm"
              >
                Your password was updated. Sign in with your new password.
              </p>
            ) : null}
            {params.error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
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
                <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <SocialButtons callbackUrl={callbackUrl} />
          </div>
        </Panel>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="font-medium text-signal-blue hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </AuthFrame>
  );
}
