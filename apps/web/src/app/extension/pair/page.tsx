import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ExtensionPairClient } from "./pair-client";

export const dynamic = "force-dynamic";

export default async function ExtensionPairPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string; mode?: string }>;
}) {
  const { challenge, mode } = await searchParams;
  const delivery = mode === "poll" ? "poll" : "bridge";
  if (!challenge || !/^[a-f0-9]{64}$/.test(challenge)) {
    return (
      <main className="bg-background flex min-h-screen items-center justify-center px-6">
        <section className="max-w-md space-y-4">
          <h1 className="font-display text-3xl">Start from your extension</h1>
          <p className="text-muted-foreground leading-7">This connection link is incomplete. Open the ActorConsole extension sidebar and choose Sign in to start a new browser connection.</p>
          <a href="/dashboard" className="underline underline-offset-4">Go to ActorConsole</a>
        </section>
      </main>
    );
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/extension/pair?challenge=${challenge}${delivery === "poll" ? "&mode=poll" : ""}`)}`);
  }
  return <ExtensionPairClient challenge={challenge} delivery={delivery} account={{ name: session.user.name, email: session.user.email }} />;
}
