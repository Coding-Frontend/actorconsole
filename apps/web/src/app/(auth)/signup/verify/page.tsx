import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { MailCheck, Inbox, Link2, ArrowRight } from "lucide-react";
import { AuthBrandSteps, AuthFrame } from "@/components/auth/auth-frame";

export const metadata = { title: "Check your email" };

export default function VerifyRequestPage() {
  return (
    <AuthFrame
      brand={
        <AuthBrandSteps
          eyebrow="Email sign-in"
          title="Your next operating session starts in the inbox."
          description="Use the secure sign-in link to continue without adding another credential to remember."
          steps={[
            {
              title: "Open your inbox",
              description: "Find the latest ActorConsole sign-in message.",
              icon: <Inbox className="text-signal-orange h-4 w-4" />,
            },
            {
              title: "Use the secure link",
              description: "The link expires after 24 hours.",
              icon: <Link2 className="text-signal-orange h-4 w-4" />,
            },
            {
              title: "Continue",
              description: "Return to the workspace and pick up where you left off.",
              icon: <ArrowRight className="text-signal-orange h-4 w-4" />,
            },
          ]}
        />
      }
    >
      <div className="space-y-6">
        <div>
          <p className="type-kicker eyebrow-line text-signal-orange">Email sign-in</p>
          <h1 className="font-display-tight text-foreground mt-5 text-4xl sm:text-5xl">
            Check your email.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-sm text-sm leading-6">
            We&apos;ve sent a secure link to your inbox. Use it to finish creating your account.
          </p>
        </div>

        <Panel variant="default" radius="none" className="auth-form-panel bg-card/90">
          <div className="space-y-4 text-center">
            <div className="bg-signal-blue/10 mx-auto flex h-12 w-12 items-center justify-center rounded-full">
              <MailCheck className="text-signal-blue h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Check your email</h1>
              <p className="text-muted-foreground mt-2 text-sm">
                We&apos;ve sent a magic link to your inbox. Click the link to finish creating your
                account.
              </p>
            </div>
            <p className="text-muted-foreground text-xs">
              The link expires in 24 hours. If you don&apos;t see the email, check your spam folder.
            </p>
          </div>
        </Panel>

        <p className="text-muted-foreground text-center text-sm">
          <Link href="/signup" className="text-signal-blue font-medium hover:underline">
            Use a different email
          </Link>
        </p>
      </div>
    </AuthFrame>
  );
}
